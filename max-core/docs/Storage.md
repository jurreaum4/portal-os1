# Storage and offline sync

```text
State (optional)
  -> SyncStorage
      -> IndexedDBStorage: atomic journal = materialized records + pending writes + clock
      -> SyncTransport: authenticated host transport
          -> DurableObjectSync: serializes requests within an actor
              -> D1SyncStore: transactional merge and snapshot
```

## Local storage

```ts
import { SyncStorage, State } from "max-core";
import { IndexedDBStorage } from "max-core/indexeddb";
const local = new IndexedDBStorage(indexedDB, "my-core-data");
// Host supplies an authenticated transport implementing exchange(records).
const storage = new SyncStorage(local, transport, actorId);
await storage.recover(); // online rehydration; may reject while offline
await storage.set("preferences", { theme: "dark" }); // durable local queue
await storage.sync(); // explicit network boundary, retry on reconnection
```

`MemoryStorage` is also available for ephemeral hosts and tests. Native persistent stores implement StorageContract. IndexedDB resolves writes on transaction completion, handles version changes, closes stale connections, and bounds stalled opens/transactions (default 5 seconds). Failures reject; they do not silently fall back to volatile storage. `close()` releases a connection when the host is finished.

One SyncStorage instance exclusively owns a journal key. Use a host-level coordinator (for example a single shared worker), or separate local database/journal keys for each writer. Cross-tab read/modify/write locking is not implemented. Actor IDs must be unique for each independent journal and use ASCII letters, digits, underscore, or hyphen; a UUID is suitable. Reuse an actor only when resuming its intact journal. After losing a journal, use a fresh actor ID and recover before editing when online.

## Protocol and conflicts

Records contain `{ key, value, deleted, counter, actor }`. The counter is a Lamport clock, incremented on each local mutation and advanced on receiving remote records. The highest `(counter, actor)` wins per key, with ASCII lexical ordering as the deterministic tie breaker. This is a logical last-writer policy, not wall-clock last-write-wins or a field-level CRDT. Concurrent edits to different fields of one key can overwrite each other. Split independently editable data into separate keys if needed.

Deletes persist as tombstones so an old client cannot resurrect deleted data with an older version. Tombstones are not garbage-collected automatically. Pending updates coalesce by key. Local writes atomically save the journal before resolving. Sync serializes with local operations, sends the queue, validates an authoritative server snapshot, merges it, and clears the queue only after persisting the acknowledged snapshot. The transport must atomically commit the supplied records and return all records in its scope, including tombstones and versions that supersede pending records. Missing acknowledgements reject. Duplicate delivery after network failure or local acknowledgement failure is safe.

The journal and server exchange currently use full snapshots. This is intended for bounded application state, not unlimited histories or large binary assets. Respect host transaction/request limits; batch pagination requires a future explicit protocol change.

## Cloudflare integration

Apply `max-core/storage/schema.sql` to a dedicated database or existing database before using D1SyncStore. The table is namespaced by a trusted server-selected scope; the client must not select another tenant's scope.

Inside the integrating application's actual Durable Object class:

```ts
import { DurableObject } from "cloudflare:workers";
import { DurableObjectSync, D1SyncStore, type SyncRecord } from "max-core";

export class SyncActor extends DurableObject<{ DB: D1Database }> {
  private sync = new DurableObjectSync(
    new D1SyncStore(this.env.DB, this.ctx.id.toString()),
  );
  exchange(records: SyncRecord[]) {
    return this.sync.exchange(records);
  }
}
```

The host Worker authenticates requests, chooses the correct Durable Object ID, validates request size, and forwards the request through the DO binding. A browser SyncTransport maps `exchange` to that authenticated endpoint. Configure the DO binding, class migration, D1 binding and database migration in the host's Wrangler configuration. These are deployment-specific and are not installed into Portal-OS1 by this package.

D1SyncStore uses one atomic D1 batch for conditional upserts plus reading the resulting snapshot. A failed batch is never acknowledged. DurableObjectSync is the reusable serial coordinator composed inside the host's real Durable Object; D1 remains the durable authority across DO restarts. No redundant in-memory cache is treated as durable data. The integration test exercises actual local D1 bindings and this coordinator, rather than deploying an external Cloudflare service.

## Storage loss and Safari

Safari/iOS detection enables storage, memory, and image safety policy flags. The host must honor these flags when allocating memory and choosing renderers. Persistence detection reports the browser's actual persisted grant, never a guarantee against deletion. IndexedDB connection failures and quota errors propagate to the host; show an actionable status and retry after storage becomes available.

`recover()` runs sync, restoring acknowledged remote records into a recreated journal and preserving any pending journal still held in memory. A live instance can rewrite its surviving in-memory journal after local deletion. A restarted instance can only restore remote data if every local copy was deleted. Unsynced writes cannot survive loss of every copy. Offline recovery after complete storage deletion requires a separate host-managed backup; no remote data is available without a network connection.
