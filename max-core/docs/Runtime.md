# Runtime

## Kernel and services

```ts
import { Kernel } from "max-core";
const kernel = new Kernel();
kernel.services.register("storage", {
  async start() {
    await storage.recover();
  },
  async stop() {},
});
await kernel.boot();
kernel.processes.create("simulation");
kernel.processes.start("simulation");
kernel.scheduler.schedule(() => simulation.update(), 16);
kernel.scheduler.advance(16);
await kernel.shutdown();
```

Registration order defines dependency order. Duplicate names and registration during a running service lifecycle reject. Boot starts services in order. On failure, cleanup stops all attempted services (including the partially started failing service) in reverse order. Services must make `stop()` safe after a partial start. Cleanup attempts every service and aggregates errors. Successful repeated kernel boot/shutdown calls are idempotent; overlapping transitions reject. Kernel shutdown clears scheduled work and stops all processes before service cleanup. Use Kernel to coordinate service lifecycle.

ProcessManager tracks created/running/paused/stopped states and rejects invalid transitions or unknown IDs. It is a logical process registry, not an OS thread or sandbox. Hosts execute the associated work and use process state to control it.

Scheduler uses explicit elapsed logical time, avoiding timer APIs. Schedule synchronous callbacks with a nonnegative finite delay; the returned function cancels a task. `advance(elapsed)` executes due tasks in due-time then insertion order. New tasks scheduled during a callback wait for the next advance, preventing unbounded same-pass loops. Callback errors are aggregated after other ready tasks execute. Negative/non-finite time and recursive advance calls reject. Hosts own real timers and call advance; asynchronous tasks should explicitly manage their promises.

## Detection

`detectPlatform`, `detectBrowser`, `detectRenderer`, and `detectPersistence` accept an optional DetectionEnvironment for native hosts and tests. Without one, browserEnvironment probes available globals safely. `detectRuntime()` collects:

```text
platform, browser, wasm, webgl, webgpu, pwa, persistentStorage, policy
```

An explicit platform override identifies native desktop shells. A desktop browser remains `web`. Android and iOS use UA hints, including iPad desktop mode. Browser recognition distinguishes Edge, Firefox, Chrome, and Safari. UA detection is best effort: a host bridge is more authoritative. `wasm`/`webgpu` reflect API availability, not successful device allocation; `webgl` probes a context and releases it. Hosts must handle actual allocation failure. PWA detection covers standalone display mode. `persistentStorage` checks `persisted()` without requesting permission and returns false if unavailable or denied.

Safari and all iOS browsers receive `memorySafeMode`, `storageSafeMode`, and `imageFallbackMode`. Android selects WASM compute when available and prefers WebGPU when exposed; otherwise rendering chooses WebGL or image. Policy flags are advice for host allocators/renderers, not an implementation of those rendering engines. The core itself keeps no GPU resources or image pipeline.
