import type { Json, StorageContract } from "../contracts/index.js";
import { copyJson } from "../state/value.js";
/** IndexedDB is injected so importing the package is safe in native/server hosts. */
export class IndexedDBStorage implements StorageContract {
  private database: Promise<IDBDatabase> | undefined;
  constructor(
    private readonly factory: IDBFactory,
    private readonly name = "max-core",
    private readonly timeoutMs = 5000,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      throw new RangeError("Invalid IndexedDB timeout");
  }
  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.factory.open(this.name, 1);
        let settled = false;
        const fail = (error: unknown): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        };
        const timer = setTimeout(
          () => fail(new Error("IndexedDB open timed out")),
          this.timeoutMs,
        );
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("values"))
            request.result.createObjectStore("values");
        };
        request.onerror = () => fail(request.error);
        request.onblocked = () => fail(new Error("IndexedDB open blocked"));
        request.onsuccess = () => {
          if (settled) {
            request.result.close();
            return;
          }
          settled = true;
          clearTimeout(timer);
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.database = undefined;
          };
          db.onclose = () => {
            this.database = undefined;
          };
          resolve(db);
        };
      }).catch((error) => {
        this.database = undefined;
        throw error;
      });
    }
    return this.database;
  }
  private async request(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest,
  ): Promise<unknown> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction("values", mode);
      } catch (error) {
        this.database = undefined;
        reject(error);
        return;
      }
      let result: unknown;
      const timer = setTimeout(() => {
        try {
          transaction.abort();
        } catch {
          /* Already closed. */
        }
        db.close();
        this.database = undefined;
        reject(new Error("IndexedDB transaction timed out"));
      }, this.timeoutMs);
      transaction.oncomplete = () => {
        clearTimeout(timer);
        resolve(result);
      };
      transaction.onabort = () => {
        clearTimeout(timer);
        reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
      };
      transaction.onerror = () => {
        /* Abort event rejects only after rollback. */
      };
      try {
        const request = action(transaction.objectStore("values"));
        request.onsuccess = () => {
          result = request.result;
        };
      } catch (error) {
        clearTimeout(timer);
        transaction.abort();
        reject(error);
      }
    });
  }
  async get(key: string): Promise<Json | undefined> {
    const value = await this.request("readonly", (store) => store.get(key));
    return value === undefined ? undefined : (copyJson(value) as Json);
  }
  async set(key: string, value: Json): Promise<void> {
    const snapshot = copyJson(value);
    await this.request("readwrite", (store) => store.put(snapshot, key));
  }
  async remove(key: string): Promise<void> {
    await this.request("readwrite", (store) => store.delete(key));
  }
  async close(): Promise<void> {
    const database = this.database;
    this.database = undefined;
    (await database)?.close();
  }
}
