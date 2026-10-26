import type { RuntimeContract, Service } from "../contracts/index.js";
/** Registration order defines dependency order. Stop order is reversed. */
export class Services {
  private entries = new Map<string, Service>();
  private active: Service[] = [];
  private locked = false;
  register(name: string, service: Service): void {
    if (this.locked || this.entries.has(name))
      throw new Error("Services locked or duplicate name");
    this.entries.set(name, service);
  }
  get(name: string): Service {
    const service = this.entries.get(name);
    if (!service) throw new Error(`Unknown service: ${name}`);
    return service;
  }
  async start(): Promise<void> {
    if (this.locked) throw new Error("Services already started");
    this.locked = true;
    try {
      for (const service of this.entries.values()) {
        this.active.push(service);
        await service.start();
      }
    } catch (error) {
      try {
        await this.stop();
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], "Boot and rollback failed");
      }
      throw error;
    }
  }
  async stop(): Promise<void> {
    const errors: unknown[] = [];
    for (const service of this.active.reverse()) {
      try {
        await service.stop();
      } catch (error) {
        errors.push(error);
      }
    }
    this.active = [];
    this.locked = false;
    if (errors.length)
      throw new AggregateError(errors, "Service shutdown failed");
  }
}
export type ProcessStatus = "created" | "running" | "paused" | "stopped";
export class ProcessManager {
  private processes = new Map<string, ProcessStatus>();
  create(id: string): void {
    if (this.processes.has(id)) throw new Error("Duplicate process");
    this.processes.set(id, "created");
  }
  status(id: string): ProcessStatus {
    const status = this.processes.get(id);
    if (!status) throw new Error("Unknown process");
    return status;
  }
  private transition(
    id: string,
    from: ProcessStatus[],
    to: ProcessStatus,
  ): void {
    if (!from.includes(this.status(id)))
      throw new Error("Invalid process transition");
    this.processes.set(id, to);
  }
  start(id: string): void {
    this.transition(id, ["created", "stopped"], "running");
  }
  pause(id: string): void {
    this.transition(id, ["running"], "paused");
  }
  resume(id: string): void {
    this.transition(id, ["paused"], "running");
  }
  stop(id: string): void {
    this.status(id);
    this.processes.set(id, "stopped");
  }
  stopAll(): void {
    for (const id of this.processes.keys()) this.stop(id);
  }
}
/** Explicit logical time makes execution reproducible and host independent. */
export class Scheduler {
  private time = 0;
  private sequence = 0;
  private tasks = new Map<number, { due: number; run: () => void }>();
  private advancing = false;
  schedule(run: () => void, delay = 0): () => void {
    if (
      !Number.isFinite(delay) ||
      delay < 0 ||
      !Number.isFinite(this.time + delay)
    )
      throw new RangeError("Invalid delay");
    const id = this.sequence++;
    this.tasks.set(id, { due: this.time + delay, run });
    return () => {
      this.tasks.delete(id);
    };
  }
  advance(elapsed: number): void {
    if (
      this.advancing ||
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      !Number.isFinite(this.time + elapsed)
    )
      throw new RangeError("Invalid scheduler advance");
    this.time += elapsed;
    this.advancing = true;
    const errors: unknown[] = [];
    try {
      const ready = [...this.tasks]
        .filter(([, task]) => task.due <= this.time)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
      for (const [id, task] of ready) {
        if (!this.tasks.delete(id)) continue;
        try {
          task.run();
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      this.advancing = false;
    }
    if (errors.length)
      throw new AggregateError(errors, "Scheduled task failures");
  }
  clear(): void {
    this.tasks.clear();
  }
}
export class Kernel implements RuntimeContract {
  readonly services = new Services();
  readonly scheduler = new Scheduler();
  readonly processes = new ProcessManager();
  private phase: "stopped" | "starting" | "running" | "stopping" = "stopped";
  get running(): boolean {
    return this.phase === "running";
  }
  async boot(): Promise<void> {
    if (this.running) return;
    if (this.phase !== "stopped") throw new Error("Kernel transitioning");
    this.phase = "starting";
    try {
      await this.services.start();
      this.phase = "running";
    } catch (error) {
      this.phase = "stopped";
      throw error;
    }
  }
  async shutdown(): Promise<void> {
    if (this.phase === "stopped") return;
    if (!this.running) throw new Error("Kernel transitioning");
    this.phase = "stopping";
    this.scheduler.clear();
    this.processes.stopAll();
    try {
      await this.services.stop();
    } finally {
      this.phase = "stopped";
    }
  }
}
