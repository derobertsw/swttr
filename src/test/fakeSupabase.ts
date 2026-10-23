/**
 * In-memory stand-in for the subset of the Supabase query builder used by the
 * API routes: from().select().eq().neq().in().gte().order().limit()/range(), awaited
 * directly or via maybeSingle(), from().insert().select().single(), and
 * from().update().eq() or from().delete().eq() awaited directly or via
 * select().single().
 *
 * Embedded one-to-one relations (e.g. garment_thermal_properties) are stored on
 * each row, matching PostgREST's response shape. A gte() filter on an embedded
 * column ("relation.column") drops rows without a match, like `relation!inner`.
 */
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Filter = (row: Row) => boolean;

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  private readonly filters: Filter[] = [];
  private readonly sorts: Array<(a: Row, b: Row) => number> = [];
  private offset = 0;
  private maxRows = Infinity;
  private patch: Row | null = null;
  private deleting = false;

  constructor(private readonly rows: Row[], private readonly cap = Infinity) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  gte(column: string, value: number) {
    this.filters.push((row) => {
      const cell = readColumn(row, column);
      return typeof cell === "number" && cell >= value;
    });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    const direction = options.ascending === false ? -1 : 1;
    this.sorts.push((a, b) => {
      const x = a[column] as string | number;
      const y = b[column] as string | number;
      return x < y ? -direction : x > y ? direction : 0;
    });
    return this;
  }

  limit(count: number) {
    this.maxRows = count;
    return this;
  }

  /** Rows `from` to `to`, inclusive, as PostgREST pages them. */
  range(from: number, to: number) {
    this.offset = from;
    this.maxRows = to - from + 1;
    return this;
  }

  /** Applies `values` to every row matching the filters once awaited. */
  update(values: Row) {
    this.patch = values;
    return this;
  }

  /** Removes every row matching the filters once awaited. */
  delete() {
    this.deleting = true;
    return this;
  }

  /** Appends a row with a generated id and created_at, read back via select().single(). */
  insert(values: Row) {
    const row = { id: `row_${this.rows.length + 1}`, created_at: new Date().toISOString(), ...values };
    this.rows.push(row);
    const result = { data: structuredClone(row), error: null };
    return { select: () => ({ single: () => Promise.resolve(result) }) };
  }

  /** Resolves to the first matching row, or null. */
  maybeSingle() {
    return Promise.resolve({ data: this.matches()[0] ?? null, error: null });
  }

  /** Resolves to the first matching row, or PostgREST's error when there is none. */
  single() {
    const row = this.matches()[0];
    return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { code: "PGRST116", message: "No rows" } });
  }

  private matches(): Row[] {
    const rows = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.patch) for (const row of rows) Object.assign(row, this.patch);
    if (this.deleting) for (const row of rows) this.rows.splice(this.rows.indexOf(row), 1);
    for (const compare of [...this.sorts].reverse()) rows.sort(compare);
    return structuredClone(rows.slice(this.offset, this.offset + Math.min(this.maxRows, this.cap)));
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.matches(), error: null as null }).then(onfulfilled, onrejected);
  }
}

function readColumn(row: Row, column: string): unknown {
  const [relation, field] = column.split(".");
  if (field === undefined) return row[relation];
  const embedded = row[relation];
  return embedded && typeof embedded === "object" ? (embedded as Row)[field] : undefined;
}

/** A table that doesn't exist yet: every query fails as PostgREST reports a missing table. */
class MissingTable {
  select() { return this; }
  eq() { return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  then<TResult1 = { data: null; error: { code: string; message: string } }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: { code: string; message: string } }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }).then(onfulfilled, onrejected);
  }
}

/**
 * `missing` lists tables from migrations that aren't applied. `maxRows` caps
 * every read without an error, like PostgREST's max_rows.
 */
export function createFakeSupabase(tables: Tables, { missing = [], maxRows = Infinity }: { missing?: string[]; maxRows?: number } = {}) {
  return {
    from: (table: string) => missing.includes(table) ? new MissingTable() as unknown as FakeQuery : new FakeQuery((tables[table] ??= []), maxRows),
  };
}
