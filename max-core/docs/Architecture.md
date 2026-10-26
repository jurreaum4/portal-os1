# Architecture

MAX-CORE provides contracts, state, events, simulation, runtime, storage, and adapters. `intelligence/` reserves a future platform-neutral policy boundary. No module imports Portal-OS1, MAX Games, MAX Media, or MAX Art.

Dependency direction:

```text
host application -> platform adapters -> core contracts
                 -> State / Event / Simulation / Kernel
                 -> SyncStorage -> StorageContract + SyncTransport
```

The default entry point works without browser globals or DOM type libraries. Browser IndexedDB is exported separately as `max-core/indexeddb`. All production code is TypeScript with strict checking, checked indexed access, exact optional properties, and emitted declarations. Tests include compile-time interface assignments and invalid event payload assertions.

## Contracts

| Contract              | Behavior                                                       |
| --------------------- | -------------------------------------------------------------- |
| StateContract<T>      | get, set, shallow patch, subscribe/unsubscribe, hydrate, flush |
| EventContract<E>      | emit, subscribe/unsubscribe for a typed event map              |
| SimulationContract<T> | fixed-step start/pause/resume/stop/update                      |
| StorageContract       | asynchronous get/set/remove; undefined means missing           |
| RuntimeContract       | boot/shutdown with observable running state                    |
| AdapterContract       | platform, storage, telemetry, notifications, purchases         |

## State

State values must be finite JSON data: plain objects, arrays, strings, booleans, null, and finite numbers. Dates, undefined, sparse arrays, class instances, cycles, and non-finite numbers are rejected. Updates copy their inputs, recursively freeze snapshots, and synchronously notify a snapshot of listeners with `(next, previous)`. `patch` replaces top-level properties; it does not recursively merge objects. `set` notifies even if equal. Unsubscribe affects subsequent dispatches. Subscriber failures are collected and thrown after all listeners run; the state has already committed.

Persistence is optional. Supply `{ storage, key, decode }` to the constructor. `decode` must validate the application's persisted schema and perform migrations if needed. Writes are serialized. `flush()` awaits writes queued at invocation and reports failures; callers should await it at explicit durability boundaries. A failed write does not roll back visible state or retry automatically. `hydrate()` waits for earlier writes and only applies decoded data if no intervening mutation occurred. It emits notifications without persisting the same value again.

## Events

Create one typed `Event<YourEventMap>` instance and inject it into communicating systems for global routing. No implicit singleton is created. Delivery is synchronous, registration ordered, and uses a listener snapshot. Errors are aggregated after all listeners run. Event payload ownership belongs to the caller; consumers should treat shared payloads as immutable. There is no network transport or replay history in the event bus.

## Packaging and checks

Build with `npm run build -w max-core`. Copy this directory and run `npm install` to develop it independently. Run `npm pack --dry-run` from the package to inspect published files. SQL schema and developer docs ship with the package. The root test command also runs the existing Worker tests and the D1 integration test. The parent repository currently has unrelated optional-DB type errors; core typechecking is independent.
