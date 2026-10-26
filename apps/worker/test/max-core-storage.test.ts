import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
  D1SyncStore,
  DurableObjectSync,
  SyncStorage,
  MemoryStorage,
} from "../../../max-core/index.js";

const bindings = env as unknown as { DB: D1Database; MAX_CORE_SCHEMA: string };

describe("MAX-CORE D1 integration", () => {
  it("commits sync batches, resolves conflicts, isolates scopes and restores tombstones", async () => {
    await bindings.DB.prepare(bindings.MAX_CORE_SCHEMA).run();
    const durable = new DurableObjectSync(
      new D1SyncStore(bindings.DB, "test-core"),
    );
    const a = new SyncStorage(new MemoryStorage(), durable, "a");
    const b = new SyncStorage(new MemoryStorage(), durable, "b");
    await a.set("key", { count: 1 });
    await b.set("key", { count: 2 });
    await b.sync();
    await a.sync();
    expect(await a.get("key")).toEqual({ count: 2 });
    await a.remove("key");
    await a.sync();
    await b.sync();
    expect(await b.get("key")).toBeUndefined();
    const restarted = new SyncStorage(
      new MemoryStorage(),
      new DurableObjectSync(new D1SyncStore(bindings.DB, "test-core")),
      "c",
    );
    await restarted.recover();
    expect(await restarted.get("key")).toBeUndefined();
    expect(
      await new D1SyncStore(bindings.DB, "different-scope").exchange([]),
    ).toEqual([]);
  });
});
