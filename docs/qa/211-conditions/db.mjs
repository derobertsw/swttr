// An in-memory Postgres (PGlite) with every migration in supabase/migrations
// applied, behind the part of the Supabase client the trip routes use. Unlike
// #337's fake (src/test/fakeSupabase.ts), saves run the real SQL functions,
// so sources and reviews are added, corrected, refused and replayed by the
// migrations' own rules. Nothing here talks to a real database.
//
// Supported, as the trip code uses them (see src/test/fakeSupabase.ts):
// from(table).select(columns).eq/neq/in/is/gte/lte/gt/lt().order().limit()/range()
// awaited or with single()/maybeSingle(); insert/upsert/update/delete with an
// optional select(); and rpc(name, args) with named arguments, as PostgREST.
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/** Every migration, in file order, as `supabase db push` would apply them. */
export async function createDatabase(root) {
  const db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  const folder = resolve(root, 'supabase/migrations');
  for (const file of (await readdir(folder)).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(folder, file), 'utf8'));
  }
  // PostgREST answers timestamps in UTC.
  await db.exec("SET TIME ZONE 'UTC'");
  return db;
}

const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`QA db: unsupported identifier ${JSON.stringify(name)}`);
  return `"${name}"`;
};

/** Column types per table, and each function's overloads, read once from the catalog. */
async function catalog(db) {
  const columns = new Map();
  const { rows } = await db.query(`SELECT c.relname AS table, a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND a.attnum > 0 AND NOT a.attisdropped`);
  for (const row of rows) {
    if (!columns.has(row.table)) columns.set(row.table, new Map());
    columns.get(row.table).set(row.column, row.type);
  }
  const keys = new Map();
  const pk = await db.query(`SELECT c.relname AS table, array_agg(a.attname ORDER BY a.attnum) AS columns
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE n.nspname = 'public' AND i.indisprimary GROUP BY c.relname`);
  for (const row of pk.rows) keys.set(row.table, row.columns);
  const functions = new Map();
  const fns = await db.query(`SELECT p.proname AS name, p.proretset AS set, format_type(p.prorettype, NULL) AS returns,
      p.pronargdefaults AS defaults, coalesce(p.proargnames, '{}') AS names, coalesce(p.proargmodes::text[], '{}') AS modes,
      ARRAY(SELECT format_type(t, NULL) FROM unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) AS t) AS types
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`);
  for (const fn of fns.rows) {
    const args = fn.names.map((name, index) => ({ name, type: fn.types[index], mode: fn.modes[index] ?? 'i' }))
      .filter((arg) => arg.mode === 'i' || arg.mode === 'b');
    if (!functions.has(fn.name)) functions.set(fn.name, []);
    functions.get(fn.name).push({ args, defaults: fn.defaults, set: fn.set, returns: fn.returns });
  }
  return { columns, keys, functions };
}

/** The JSON parameter `$index` cast to `type`; JSON null is SQL NULL, as PostgREST passes it. */
function cast(index, type) {
  const value = `nullif($${index}::jsonb, 'null'::jsonb)`;
  if (type === 'json' || type === 'jsonb') return `${value}::${type}`;
  if (type.endsWith('[]')) return `(CASE WHEN ${value} IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(${value})) END)::${type}`;
  return `(${value} #>> '{}')::${type}`;
}

const failure = (error) => ({
  data: null, count: null, status: 400,
  error: { code: error?.code ?? 'XX000', message: error?.message ?? String(error), details: error?.detail ?? null, hint: error?.hint ?? null },
});

const all = (from) => `SELECT coalesce(json_agg(q), '[]'::json) AS data FROM ${from}`;

class Query {
  constructor(client, table) {
    this.client = client; this.table = table; this.op = 'select'; this.columns = '*';
    this.filters = []; this.orders = []; this.limitTo = null; this.offset = 0; this.params = [];
    this.returning = null; this.values = null; this.upsertOptions = null; this.mode = null;
  }
  type(column) {
    const type = this.client.meta.columns.get(this.table)?.get(column);
    if (!type) throw new Error(`QA db: no column ${this.table}.${column}`);
    return type;
  }
  param(value) { this.params.push(JSON.stringify(value ?? null)); return this.params.length; }
  // Filters are kept as functions: column types come from the catalog, read once the client is ready.
  where(column, operator, value) {
    this.filters.push(() => `x.${ident(column)} ${operator} ${cast(this.param(value), this.type(column))}`);
    return this;
  }
  select(columns = '*') {
    if (this.op === 'select') this.columns = columns; else this.returning = columns;
    return this;
  }
  eq(column, value) { return value === null ? this.is(column, null) : this.where(column, '=', value); }
  neq(column, value) { return this.where(column, '<>', value); }
  gt(column, value) { return this.where(column, '>', value); }
  gte(column, value) { return this.where(column, '>=', value); }
  lt(column, value) { return this.where(column, '<', value); }
  lte(column, value) { return this.where(column, '<=', value); }
  in(column, values) {
    this.filters.push(() => `x.${ident(column)} = ANY(ARRAY(SELECT jsonb_array_elements_text($${this.param(values)}::jsonb))::${this.type(column)}[])`);
    return this;
  }
  is(column, value) {
    this.filters.push(() => `x.${ident(column)} IS ${value === null ? 'NULL' : value ? 'TRUE' : 'FALSE'}`);
    return this;
  }
  order(column, { ascending = true } = {}) { this.orders.push(`x.${ident(column)} ${ascending ? 'ASC' : 'DESC'}`); return this; }
  limit(count) { this.limitTo = count; return this; }
  range(from, to) { this.offset = from; this.limitTo = to - from + 1; return this; }
  insert(values) { this.op = 'insert'; this.values = values; return this; }
  upsert(values, options = {}) { this.op = 'upsert'; this.values = values; this.upsertOptions = options; return this; }
  update(values) { this.op = 'update'; this.values = values; return this; }
  delete() { this.op = 'delete'; return this; }
  single() { this.mode = 'single'; return this.run(); }
  maybeSingle() { this.mode = 'maybe'; return this.run(); }
  then(done, fail) { return this.run().then(done, fail); }

  list(columns) {
    if (columns.trim() === '*') return 'x.*';
    return columns.split(',').map((column) => column.trim()).filter(Boolean).map((column) => `x.${ident(column)}`).join(', ');
  }
  sql() {
    this.params = [];
    const table = `public.${ident(this.table)}`;
    const filters = this.filters.map((filter) => filter());
    const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
    if (this.op === 'select') {
      const order = this.orders.length ? ` ORDER BY ${this.orders.join(', ')}` : '';
      const page = `${this.limitTo === null ? '' : ` LIMIT ${Number(this.limitTo)}`}${this.offset ? ` OFFSET ${Number(this.offset)}` : ''}`;
      return all(`(SELECT ${this.list(this.columns)} FROM ${table} AS x${where}${order}${page}) q`);
    }
    const returning = ` RETURNING ${this.list(this.returning ?? '*')}`;
    if (this.op === 'delete') return `WITH q AS (DELETE FROM ${table} AS x${where}${returning}) ${all('q')}`;
    const rows = Array.isArray(this.values) ? this.values : [this.values];
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    keys.forEach((key) => this.type(key));
    const index = this.param(this.op === 'update' ? rows[0] : rows);
    if (this.op === 'update') {
      const set = keys.map((key) => `${ident(key)} = r.${ident(key)}`).join(', ');
      return `WITH q AS (UPDATE ${table} AS x SET ${set} FROM jsonb_populate_record(NULL::${table}, $${index}::jsonb) AS r${where}${returning}) ${all('q')}`;
    }
    const cols = keys.map(ident).join(', ');
    let conflict = '';
    if (this.op === 'upsert') {
      const target = this.upsertOptions.onConflict ? this.upsertOptions.onConflict.split(',').map((c) => c.trim()) : this.client.meta.keys.get(this.table);
      const updates = keys.filter((key) => !target.includes(key)).map((key) => `${ident(key)} = EXCLUDED.${ident(key)}`);
      conflict = ` ON CONFLICT (${target.map(ident).join(', ')}) ${this.upsertOptions.ignoreDuplicates || updates.length === 0 ? 'DO NOTHING' : `DO UPDATE SET ${updates.join(', ')}`}`;
    }
    return `WITH q AS (INSERT INTO ${table} AS x (${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::${table}, $${index}::jsonb)${conflict}${returning}) ${all('q')}`;
  }
  async run() {
    let rows;
    try {
      await this.client.ready;
      const sql = this.sql();
      rows = (await this.client.db.query(sql, this.params)).rows[0].data;
    } catch (error) {
      console.warn(`QA db: ${this.op} ${this.table} failed: ${error?.code} ${error?.message}`);
      return failure(error);
    }
    if (this.mode === 'single' && rows.length !== 1) return { ...failure({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }), status: 406 };
    if (this.mode === 'maybe' && rows.length > 1) return { ...failure({ code: 'PGRST116', message: 'JSON object requested, multiple rows returned' }), status: 406 };
    // A write without select() answers like PostgREST's return=minimal.
    const data = this.mode ? rows[0] ?? null : this.op !== 'select' && this.returning === null ? null : rows;
    return { data, error: null, count: null, status: 200 };
  }
}

/** PostgREST's choice of overload: exactly the arguments given, or else one whose missing arguments all have defaults. */
function overloadFor(overloads, given) {
  const fits = (fn) => given.every((key) => fn.args.some((arg) => arg.name === key))
    && fn.args.every((arg, index) => given.includes(arg.name) || index >= fn.args.length - fn.defaults);
  return overloads.find((fn) => fn.args.length === given.length && fits(fn)) ?? overloads.find(fits);
}

/**
 * A Supabase-shaped client over `db`. `before(name, args)` can answer an rpc
 * with an error instead of the database (an injected failure).
 */
export function supabaseFor(db, { before } = {}) {
  const client = { db, meta: null, ready: null };
  client.ready = catalog(db).then((meta) => { client.meta = meta; });
  return {
    from: (table) => new Query(client, table),
    async rpc(name, args = {}) {
      const forced = before?.(name, args);
      if (forced) return failure(forced);
      await client.ready;
      const given = Object.keys(args);
      const fn = overloadFor(client.meta.functions.get(name) ?? [], given);
      if (!fn) return failure({ code: 'PGRST202', message: `Could not find the function public.${name}` });
      const params = given.map((key) => JSON.stringify(args[key] ?? null));
      const named = given.map((key, index) => `${ident(key)} => ${cast(index + 1, fn.args.find((arg) => arg.name === key).type)}`);
      const call = `public.${ident(name)}(${named.join(', ')})`;
      const sql = fn.set ? `SELECT coalesce(json_agg(t), '[]'::json) AS data FROM ${call} t`
        : fn.returns === 'void' ? `SELECT ${call}, NULL::json AS data` : `SELECT to_json(${call}) AS data`;
      try {
        return { data: (await db.query(sql, params)).rows[0]?.data ?? null, error: null, count: null, status: 200 };
      } catch (error) {
        console.warn(`QA db: rpc ${name} failed: ${error?.code} ${error?.message}`);
        return failure(error);
      }
    },
  };
}
