import type { Json, StorageContract } from "../contracts/index.js";
import { copyJson } from "../state/value.js";
export class MemoryStorage implements StorageContract {
  private values = new Map<string, Json>();
  async get(key: string): Promise<Json | undefined> {
    const value = this.values.get(key);
    return value === undefined ? undefined : copyJson(value);
  }
  async set(key: string, value: Json): Promise<void> {
    this.values.set(key, copyJson(value));
  }
  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}
export interface SyncRecord {
  key: string;
  value: Json;
  deleted: boolean;
  counter: number;
  actor: string;
}
export interface SyncTransport {
  exchange(records: readonly SyncRecord[]): Promise<SyncRecord[]>;
}
interface Journal {
  records: SyncRecord[];
  pending: SyncRecord[];
  counter: number;
}
export function validateRecords(value: unknown): SyncRecord[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid sync records");
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object")
      throw new TypeError("Invalid sync record");
    const record = entry as SyncRecord;
    if (
      typeof record.key !== "string" ||
      typeof record.actor !== "string" ||
      !/^[A-Za-z0-9_-]+$/.test(record.actor) ||
      !Number.isSafeInteger(record.counter) ||
      record.counter < 1 ||
      typeof record.deleted !== "boolean"
    )
      throw new TypeError("Invalid sync record");
    return {
      key: record.key,
      actor: record.actor,
      counter: record.counter,
      deleted: record.deleted,
      value: copyJson(record.value),
    };
  });
}
/** Lamport counter, then actor ID; actor IDs must uniquely identify journal writers. */
export function compareRecords(a: SyncRecord, b: SyncRecord): number {
  return (
    a.counter - b.counter ||
    (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0)
  );
}
export function mergeRecords(...groups: readonly SyncRecord[][]): SyncRecord[] {
  const result = new Map<string, SyncRecord>();
  for (const group of groups)
    for (const record of validateRecords(group)) {
      const old = result.get(record.key);
      if (!old || compareRecords(record, old) > 0)
        result.set(record.key, record);
    }
  return [...result.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
}
/** One instance owns one journal. Host coordination is required for shared tabs/processes. */
export class SyncStorage implements StorageContract {
  private journal: Journal = { records: [], pending: [], counter: 0 };
  private loaded = false;
  private serial: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly local: StorageContract,
    private readonly remote: SyncTransport,
    private readonly actor: string,
    private readonly journalKey = "max-core:journal",
  ) {
    if (!/^[A-Za-z0-9_-]+$/.test(actor))
      throw new Error("A unique actor ID is required");
  }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation);
    this.serial = result.catch(() => undefined);
    return result;
  }
  private async load(): Promise<void> {
    if (this.loaded) return;
    const raw = await this.local.get(this.journalKey);
    if (raw !== undefined) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new TypeError("Invalid journal");
      const records = validateRecords(raw.records);
      const pending = validateRecords(raw.pending);
      const counter = raw.counter;
      if (
        typeof counter !== "number" ||
        !Number.isSafeInteger(counter) ||
        counter < 0 ||
        [...records, ...pending].some((record) => record.counter > counter)
      )
        throw new TypeError("Invalid journal counter");
      this.journal = {
        records: mergeRecords(records, pending),
        pending,
        counter,
      };
    }
    this.loaded = true;
  }
  private async save(journal: Journal): Promise<void> {
    await this.local.set(this.journalKey, copyJson(journal) as unknown as Json);
    this.journal = journal;
  }
  get(key: string): Promise<Json | undefined> {
    return this.exclusive(async () => {
      await this.load();
      const record = this.journal.records.find((record) => record.key === key);
      return record && !record.deleted ? copyJson(record.value) : undefined;
    });
  }
  set(key: string, value: Json): Promise<void> {
    const snapshot = copyJson(value);
    return this.write(key, snapshot, false);
  }
  remove(key: string): Promise<void> {
    return this.write(key, null, true);
  }
  private write(key: string, value: Json, deleted: boolean): Promise<void> {
    return this.exclusive(async () => {
      await this.load();
      const counter = this.journal.counter + 1;
      if (!Number.isSafeInteger(counter))
        throw new RangeError("Logical clock exhausted");
      const record = { key, value, deleted, counter, actor: this.actor };
      await this.save({
        counter,
        records: mergeRecords(this.journal.records, [record]),
        pending: mergeRecords(this.journal.pending, [record]),
      });
    });
  }
  /** Retry is idempotent even if a response or the local acknowledgement write is lost. */
  sync(): Promise<void> {
    return this.exclusive(async () => {
      await this.load();
      const received = validateRecords(
        await this.remote.exchange(copyJson(this.journal.pending)),
      );
      for (const pending of this.journal.pending) {
        const acknowledged = received.find(
          (record) => record.key === pending.key,
        );
        if (!acknowledged || compareRecords(acknowledged, pending) < 0)
          throw new Error("Remote did not acknowledge pending writes");
      }
      const records = mergeRecords(this.journal.records, received);
      const counter = records.reduce(
        (value, record) => Math.max(value, record.counter),
        this.journal.counter,
      );
      await this.save({ records, counter, pending: [] });
    });
  }
  /** Restore acknowledged remote data and retain any journal still held in memory. */
  recover(): Promise<void> {
    return this.sync();
  }
}
export * from "./cloudflare.js";
