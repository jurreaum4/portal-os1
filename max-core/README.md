# MAX-CORE

Platform-neutral foundation for MAX products. This directory is an independent npm workspace named `max-core`, staged in the existing repository; it can be extracted into a standalone repository. It has **zero production dependencies** and no imports from product code.

```sh
npm run build -w max-core
npm run typecheck -w max-core
npm run test -w max-core
npm run sample -w max-core
```

```ts
import { State, Event, Kernel } from "max-core";
const state = new State({ count: 0 });
const events = new Event<{ changed: number }>();
events.subscribe("changed", (count) => state.patch({ count }));
events.emit("changed", 1);
const kernel = new Kernel();
kernel.services.register("counter", { start() {}, stop() {} });
await kernel.boot();
await kernel.shutdown();
```

## Developer guide

- [Architecture and contracts](docs/Architecture.md)
- [Storage, sync, conflict resolution, and recovery](docs/Storage.md)
- [Web, iOS, Android, and desktop adapters](docs/Adapters.md)
- [Runtime lifecycle, scheduling, and detection](docs/Runtime.md)
- [Deterministic simulations](docs/Simulation.md)

Native host SDKs, authenticated sync routing, and deployment are supplied by the integrating application. No product orchestration, purchase provider, or notification service is bundled. Existing Portal clients continue to use their Worker API.
