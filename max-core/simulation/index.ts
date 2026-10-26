import type {
  DeepReadonly,
  SimulationContract,
  SimulationStatus,
} from "../contracts/index.js";
import { immutable } from "../state/value.js";
export interface SimulationConfig<T> {
  initial: T;
  stepMs: number;
  reduce(state: DeepReadonly<T>, context: { tick: number; stepMs: number }): T;
}
/** Reducers must be pure: supply seeded randomness as data if needed. */
export class Simulation<T> implements SimulationContract<T> {
  private state: DeepReadonly<T>;
  private initial: DeepReadonly<T>;
  private phase: SimulationStatus = "stopped";
  private ticks = 0;
  private readonly stepMs: number;
  private readonly reduce: SimulationConfig<T>["reduce"];
  constructor(config: SimulationConfig<T>) {
    if (!Number.isFinite(config.stepMs) || config.stepMs <= 0)
      throw new RangeError("stepMs must be positive");
    this.stepMs = config.stepMs;
    this.reduce = config.reduce;
    this.initial = immutable(config.initial);
    this.state = this.initial;
  }
  get status(): SimulationStatus {
    return this.phase;
  }
  get tick(): number {
    return this.ticks;
  }
  start(): void {
    if (this.phase !== "stopped") return;
    this.ticks = 0;
    this.state = this.initial;
    this.phase = "running";
  }
  pause(): void {
    if (this.phase === "running") this.phase = "paused";
  }
  resume(): void {
    if (this.phase === "paused") this.phase = "running";
  }
  stop(): void {
    this.phase = "stopped";
  }
  update(steps = 1): DeepReadonly<T> {
    if (!Number.isSafeInteger(steps) || steps < 0)
      throw new RangeError("steps must be a nonnegative safe integer");
    if (this.phase !== "running") return this.state;
    for (let i = 0; i < steps; i++) {
      const next = immutable(
        this.reduce(this.state, { tick: this.ticks, stepMs: this.stepMs }),
      );
      this.state = next;
      this.ticks++;
    }
    return this.state;
  }
}
