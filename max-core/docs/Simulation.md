# Simulation

Simulation is a reusable fixed-step state machine. It has no timers, DOM, random source, or product physics. Configure immutable JSON initial state, a positive finite `stepMs`, and a pure reducer.

```ts
import { Simulation } from "max-core";
const simulation = new Simulation({
  initial: { position: 0, velocity: 2 },
  stepMs: 100,
  reduce: (state, { tick, stepMs }) => ({
    ...state,
    position: state.position + (state.velocity * stepMs) / 1000,
  }),
});
simulation.start();
simulation.update(10);
simulation.pause();
simulation.resume();
simulation.stop();
```

`start()` from stopped resets initial state and tick to zero; while already active it is a no-op. `pause()` and `resume()` apply only to the corresponding active states. `stop()` retains the last snapshot until the next start. `update(steps = 1)` advances only while running and always returns the current frozen snapshot. Step counts must be nonnegative safe integers. Each successful step commits independently; if a reducer throws, that step does not advance, while prior steps remain committed.

The reducer receives the zero-based tick and constant stepMs. Pure reducers with identical inputs produce replayable results. Encode a seed and deterministic random-generator state in the simulation state if randomness is required. Do not read Date.now, Math.random, external mutable state, or platform APIs in a reducer. Floating-point arithmetic follows JavaScript semantics; fixed-point integer representations may be appropriate where exact decimal results matter.

The host decides how wall-clock time maps to steps and must bound catch-up work to avoid blocking a UI. Use Kernel's Scheduler or a host timer to call update. Run `npm run sample -w max-core` for the executable example. Tests compare independent replays, paused updates, restart behavior, and failed reducer steps.
