/**
 * In-memory stand-in for the subset of the Supabase query builder used by the
 * API routes: from().select().eq().in().gte(), awaited directly.
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

  constructor(private readonly rows: Row[]) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
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

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const data = structuredClone(this.rows.filter((row) => this.filters.every((f) => f(row))));
    return Promise.resolve({ data, error: null as null }).then(onfulfilled, onrejected);
  }
}

function readColumn(row: Row, column: string): unknown {
  const [relation, field] = column.split(".");
  if (field === undefined) return row[relation];
  const embedded = row[relation];
  return embedded && typeof embedded === "object" ? (embedded as Row)[field] : undefined;
}

export function createFakeSupabase(tables: Tables) {
  return {
    from: (table: string) => new FakeQuery(tables[table] ?? []),
  };
}
