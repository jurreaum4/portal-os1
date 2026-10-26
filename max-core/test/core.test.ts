import { IndexedDBStorage } from "../storage/indexeddb.js";
import { describe, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  State,
  Event,
  Simulation,
  Kernel,
  Scheduler,
  ProcessManager,
  MemoryStorage,
  SyncStorage,
  mergeRecords,
  DurableObjectSync,
  detectRuntime,
  detectBrowser,
  detectPlatform,
  createWebAdapter,
  createIOSAdapter,
  createAndroidAdapter,
  createDesktopAdapter,
  unsupportedCapabilities,
  type SyncRecord,
  type SyncTransport,
  type StateContract,
  type EventContract,
  type SimulationContract,
  type StorageContract,
  type RuntimeContract,
  type AdapterContract,
} from "../index.js";

function server() {
  let records: SyncRecord[] = [];
  return {
    async exchange(pending: readonly SyncRecord[]) {
      records = mergeRecords(records, [...pending]);
      return records;
    },
  };
}
describe("state contracts", () => {
  it("isolates inputs, deeply freezes snapshots and notifies/unsubscribes", () => {
    const input = { nested: { count: 1 }, label: "a" };
    const state: StateContract<typeof input> = new State(input);
    input.nested.count = 9;
    const seen = vi.fn();
    const off = state.subscribe(seen);
    state.patch({ label: "b" });
    expect(state.get()).toEqual({ nested: { count: 1 }, label: "b" });
    expect(Object.isFrozen(state.get().nested)).toBe(true);
    expect(seen).toHaveBeenCalledWith(state.get(), {
      nested: { count: 1 },
      label: "a",
    });
    off();
    state.set(input);
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it("persists ordered writes and rehydrates through a decoder", async () => {
    const storage = new MemoryStorage();
    const persistence = {
      storage,
      key: "state",
      decode: (value: unknown) => value as { count: number },
    };
    const state = new State({ count: 0 }, persistence);
    state.patch({ count: 1 });
    state.patch({ count: 2 });
    await state.flush();
    const next = new State({ count: 0 }, persistence);
    await next.hydrate();
    expect(next.get().count).toBe(2);
  });
  it("does not overwrite mutations made while hydration is in flight", async () => {
    let resolve!: (value: { count: number }) => void;
    const storage = {
      get: () =>
        new Promise<{ count: number }>((done) => {
          resolve = done;
        }),
      set: async () => {},
      remove: async () => {},
    };
    const state = new State(
      { count: 0 },
      { storage, key: "x", decode: (value) => value as { count: number } },
    );
    const hydration = state.hydrate();
    await Promise.resolve();
    await Promise.resolve();
    state.set({ count: 5 });
    resolve({ count: 1 });
    await hydration;
    expect(state.get().count).toBe(5);
  });
  it("surfaces persistence failures without unhandled promises", async () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, "set").mockRejectedValueOnce(new Error("quota"));
    const state = new State(
      { count: 0 },
      { storage, key: "x", decode: (value) => value as { count: number } },
    );
    state.patch({ count: 1 });
    await expect(state.flush()).rejects.toThrow("persistence");
    state.patch({ count: 2 });
    await state.flush();
    expect(await storage.get("x")).toEqual({ count: 2 });
  });
  it("rejects nonportable data and delivers to all subscribers on failure", () => {
    expect(() => new State({ date: new Date() })).toThrow();
    expect(() => new State({ n: NaN })).toThrow();
    const state = new State({ n: 0 });
    state.subscribe(() => {
      throw new Error("listener");
    });
    const listener = vi.fn();
    state.subscribe(listener);
    expect(() => state.patch({ n: 1 })).toThrow(AggregateError);
    expect(listener).toHaveBeenCalled();
    expect(state.get().n).toBe(1);
  });
});
it("routes typed events across consumers with snapshot delivery", () => {
  const bus: EventContract<{ changed: number }> = new Event();
  const seen = vi.fn();
  bus.subscribe("changed", () => {
    throw new Error("listener");
  });
  const off = bus.subscribe("changed", seen);
  expect(() => bus.emit("changed", 3)).toThrow(AggregateError);
  expect(seen).toHaveBeenCalledWith(3);
  off();
  expect(() => bus.emit("changed", 4)).toThrow();
  expect(seen).toHaveBeenCalledTimes(1);
  if (false) {
    // Compile-time contract checks.
    // @ts-expect-error payload is a number
    bus.emit("changed", "wrong");
    // @ts-expect-error no such event
    bus.emit("unknown", 1);
  }
});
it("replays deterministic simulations and preserves paused state", () => {
  const create = () =>
    new Simulation({
      initial: { x: 0 },
      stepMs: 10,
      reduce: (state, { tick, stepMs }) => ({ x: state.x + tick + stepMs }),
    });
  const first: SimulationContract<{ x: number }> = create();
  const second = create();
  first.start();
  second.start();
  expect(first.update(10)).toEqual(second.update(10));
  first.pause();
  expect(first.update(20)).toEqual(second.update(0));
  first.resume();
  expect(first.update()).toEqual(second.update());
  first.stop();
  first.start();
  expect(first.tick).toBe(0);
  expect(first.update()).toEqual({ x: 10 });
  expect(() => first.update(-1)).toThrow();
});
it("does not advance a failed simulation step", () => {
  const simulation = new Simulation({
    initial: 0,
    stepMs: 1,
    reduce() {
      throw new Error("step");
    },
  });
  simulation.start();
  expect(() => simulation.update()).toThrow("step");
  expect(simulation.tick).toBe(0);
});
describe("runtime", () => {
  it("boots in registration order and stops in reverse order", async () => {
    const events: string[] = [];
    const kernel = new Kernel();
    const runtime: RuntimeContract = kernel;
    for (const name of ["one", "two"])
      kernel.services.register(name, {
        start() {
          events.push(name);
        },
        stop() {
          events.push("-" + name);
        },
      });
    await runtime.boot();
    expect(runtime.running).toBe(true);
    kernel.processes.create("p");
    kernel.processes.start("p");
    const task = vi.fn();
    kernel.scheduler.schedule(task);
    await runtime.shutdown();
    kernel.scheduler.advance(0);
    expect(task).not.toHaveBeenCalled();
    expect(kernel.processes.status("p")).toBe("stopped");
    expect(events).toEqual(["one", "two", "-two", "-one"]);
  });
  it("rolls back failed starts and rejects overlapping lifecycle operations", async () => {
    const kernel = new Kernel();
    const stopped = vi.fn();
    kernel.services.register("bad", {
      async start() {
        throw new Error("boot failure");
      },
      stop: stopped,
    });
    const boot = kernel.boot();
    await expect(kernel.shutdown()).rejects.toThrow("transitioning");
    await expect(boot).rejects.toThrow("boot failure");
    expect(stopped).toHaveBeenCalled();
    expect(kernel.running).toBe(false);
  });
  it("schedules by due time and insertion order, supports cancellation", () => {
    const scheduler = new Scheduler();
    const calls: number[] = [];
    scheduler.schedule(() => calls.push(2), 2);
    scheduler.schedule(() => calls.push(1), 1);
    const cancel = scheduler.schedule(() => calls.push(9), 1);
    cancel();
    scheduler.schedule(() => {
      calls.push(3);
      scheduler.schedule(() => calls.push(4));
    }, 2);
    scheduler.advance(2);
    expect(calls).toEqual([1, 2, 3]);
    scheduler.advance(0);
    expect(calls).toEqual([1, 2, 3, 4]);
  });
  it("validates process transitions", () => {
    const manager = new ProcessManager();
    manager.create("x");
    expect(() => manager.resume("x")).toThrow();
    manager.start("x");
    manager.pause("x");
    manager.resume("x");
    manager.stop("x");
    expect(manager.status("x")).toBe("stopped");
  });
});
describe("storage", () => {
  it("implements IndexedDB persistence across connections and deletion", async () => {
    const factory = new IDBFactory();
    const first = new IndexedDBStorage(factory, "test");
    const storage: StorageContract = first;
    await storage.set("x", { nested: [1, 2] });
    await first.close();
    const second = new IndexedDBStorage(factory, "test");
    expect(await second.get("x")).toEqual({ nested: [1, 2] });
    await second.remove("x");
    expect(await second.get("x")).toBeUndefined();
    await second.close();
  });
  it("keeps offline writes through restart and retries lost acknowledgements", async () => {
    const local = new MemoryStorage();
    const durable = server();
    let fail = true;
    const remote: SyncTransport = {
      async exchange(records) {
        const result = await durable.exchange(records);
        if (fail) throw new Error("network");
        return result;
      },
    };
    const first = new SyncStorage(local, remote, "a");
    await first.set("x", { n: 1 });
    await expect(first.sync()).rejects.toThrow("network");
    const restarted = new SyncStorage(local, remote, "a");
    expect(await restarted.get("x")).toEqual({ n: 1 });
    fail = false;
    await restarted.sync();
    expect(await durable.exchange([])).toHaveLength(1);
  });
  it("converges concurrent edits and keeps tombstones against stale writers", async () => {
    const remote = server();
    const a = new SyncStorage(new MemoryStorage(), remote, "a");
    const b = new SyncStorage(new MemoryStorage(), remote, "b");
    await a.set("x", "a");
    await b.set("x", "b");
    await b.sync();
    await a.sync();
    expect(await a.get("x")).toBe("b");
    await a.remove("x");
    await a.sync();
    await b.sync();
    expect(await b.get("x")).toBeUndefined();
    expect((await remote.exchange([]))[0]?.deleted).toBe(true);
  });
  it("recovers synced state after IndexedDB is deleted", async () => {
    const factory = new IDBFactory();
    const local = new IndexedDBStorage(factory, "loss");
    const remote = server();
    const first = new SyncStorage(local, remote, "old");
    await first.set("x", "saved");
    await first.sync();
    await local.close();
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase("loss");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const recreated = new IndexedDBStorage(factory, "loss");
    const recovered = new SyncStorage(recreated, remote, "new");
    await recovered.recover();
    expect(await recovered.get("x")).toBe("saved");
    await recreated.close();
  });
  it("does not acknowledge writes when local persistence fails", async () => {
    const local = new MemoryStorage();
    const store = new SyncStorage(local, server(), "a");
    vi.spyOn(local, "set").mockRejectedValueOnce(new Error("quota"));
    await expect(store.set("x", "lost")).rejects.toThrow("quota");
    expect(await store.get("x")).toBeUndefined();
  });
  it("serializes Durable Object requests and continues after errors", async () => {
    const remote = server();
    const exchange = vi
      .spyOn(remote, "exchange")
      .mockRejectedValueOnce(new Error("offline"));
    const durable = new DurableObjectSync(remote);
    await expect(durable.exchange([])).rejects.toThrow();
    await durable.exchange([]);
    expect(exchange).toHaveBeenCalledTimes(2);
  });
});
describe("adapters and detection", () => {
  it("all hosts comply and unsupported purchases reject", async () => {
    for (const create of [
      createWebAdapter,
      createIOSAdapter,
      createAndroidAdapter,
      createDesktopAdapter,
    ]) {
      const adapter: AdapterContract = create(
        unsupportedCapabilities(new MemoryStorage()),
      );
      await adapter.storage.set("x", true);
      expect(await adapter.storage.get("x")).toBe(true);
      await expect(adapter.purchases.purchase("sku")).rejects.toThrow(
        "Unsupported",
      );
    }
  });
  it("handles iPad desktop mode, Safari safety and denied persistence", async () => {
    const result = await detectRuntime({
      userAgent: "Mozilla Macintosh Version/18 Safari/605",
      maxTouchPoints: 5,
      persistence: {
        async persisted() {
          throw new Error("denied");
        },
      },
    });
    expect(result.platform).toBe("ios");
    expect(result.browser).toBe("safari");
    expect(result.policy.memorySafeMode).toBe(true);
    expect(result.policy.storageSafeMode).toBe(true);
    expect(result.policy.imageFallbackMode).toBe(true);
    expect(result.persistentStorage).toBe(false);
  });
  it("prefers supported Android capabilities and distinguishes browsers", async () => {
    const result = await detectRuntime({
      userAgent: "Android Chrome/130 Safari/537",
      wasm: true,
      webgpu: true,
      standalone: true,
    });
    expect(result.policy.compute).toBe("wasm");
    expect(result.policy.renderer).toBe("webgpu");
    expect(result.pwa).toBe(true);
    expect(detectBrowser({ userAgent: "Chrome/130 Safari/537 Edg/130" })).toBe(
      "edge",
    );
    expect(detectBrowser({ userAgent: "iPhone CriOS/130 Safari/605" })).toBe(
      "chrome",
    );
    expect(detectPlatform({ platform: "desktop" })).toBe("desktop");
    expect((await detectRuntime({})).platform).toBe("unknown");
  });
});

// Failed acknowledgement and unavailable browser APIs must not lose durable data.
it("retains pending writes when a transport omits acknowledgements", async () => {
  const local = new MemoryStorage();
  const storage = new SyncStorage(
    local,
    {
      async exchange() {
        return [];
      },
    },
    "a",
  );
  await storage.set("x", "pending");
  await expect(storage.sync()).rejects.toThrow("acknowledge");
  const remote = server();
  const restarted = new SyncStorage(local, remote, "a");
  await restarted.sync();
  expect((await remote.exchange([]))[0]?.value).toBe("pending");
});
it("rejects stalled IndexedDB opens within the configured timeout", async () => {
  vi.useFakeTimers();
  try {
    const factory = {
      open() {
        return {};
      },
    } as unknown as IDBFactory;
    const storage = new IndexedDBStorage(factory, "blocked", 10);
    const result = expect(storage.get("x")).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(11);
    await result;
  } finally {
    vi.useRealTimers();
  }
});
it("does not classify Node navigator as a browser", async () => {
  expect((await detectRuntime()).platform).toBe("unknown");
});
