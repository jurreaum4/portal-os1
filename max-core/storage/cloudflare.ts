import {
  validateRecords,
  type SyncRecord,
  type SyncTransport,
} from "./index.js";
/** Structural interfaces accept real Cloudflare bindings without SDK dependencies. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
}
export interface D1Binding {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(
    statements: D1Statement[],
  ): Promise<{ results: T[]; success: boolean }[]>;
}
/** Apply storage/schema.sql before use. Scope is a trusted server-side tenant ID. */
export class D1SyncStore implements SyncTransport {
  constructor(
    private readonly db: D1Binding,
    private readonly scope: string,
  ) {
    if (!scope) throw new Error("A storage scope is required");
  }
  async exchange(input: readonly SyncRecord[]): Promise<SyncRecord[]> {
    const records = validateRecords(input);
    const statements = records.map((record) =>
      this.db
        .prepare(
          `INSERT INTO max_core_records (scope, key, value, deleted, counter, actor) VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(scope, key) DO UPDATE SET value=excluded.value, deleted=excluded.deleted, counter=excluded.counter, actor=excluded.actor
   WHERE excluded.counter > max_core_records.counter OR (excluded.counter = max_core_records.counter AND excluded.actor > max_core_records.actor)`,
        )
        .bind(
          this.scope,
          record.key,
          JSON.stringify(record.value),
          record.deleted ? 1 : 0,
          record.counter,
          record.actor,
        ),
    );
    statements.push(
      this.db
        .prepare(
          "SELECT key, value, deleted, counter, actor FROM max_core_records WHERE scope = ?",
        )
        .bind(this.scope),
    );
    const results = await this.db.batch<{
      key: string;
      value: string;
      deleted: number;
      counter: number;
      actor: string;
    }>(statements);
    if (
      results.length !== statements.length ||
      results.some((result) => !result.success)
    )
      throw new Error("D1 sync transaction failed");
    return validateRecords(
      results
        .at(-1)!
        .results.map((row) => ({
          ...row,
          value: JSON.parse(row.value) as unknown,
          deleted: row.deleted === 1,
        })),
    );
  }
}
/** Compose inside a Durable Object RPC class; one instance per authenticated scope.
 * D1 is the durable authority. An awaited batch commits before acknowledging a client.
 */
export class DurableObjectSync implements SyncTransport {
  private serial: Promise<unknown> = Promise.resolve();
  constructor(private readonly durable: SyncTransport) {}
  exchange(records: readonly SyncRecord[]): Promise<SyncRecord[]> {
    const snapshot = validateRecords(records);
    const result = this.serial.then(() => this.durable.exchange(snapshot));
    this.serial = result.catch(() => undefined);
    return result;
  }
}
