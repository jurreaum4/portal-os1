import type {
  DeepReadonly,
  Json,
  StateContract,
  StateListener,
  StorageContract,
} from "../contracts/index.js";
import { immutable } from "./value.js";
export interface Persistence<T> {
  storage: StorageContract;
  key: string;
  decode(value: Json): T;
}
export class State<T extends object> implements StateContract<T> {
  private value: DeepReadonly<T>;
  private listeners = new Set<StateListener<T>>();
  private revision = 0;
  private writes: Promise<void> = Promise.resolve();
  private failures: unknown[] = [];
  constructor(
    initial: T,
    private readonly persistence?: Persistence<T>,
  ) {
    this.value = immutable(initial);
  }
  get(): DeepReadonly<T> {
    return this.value;
  }
  set(value: T): void {
    this.commit(value, true);
  }
  patch(value: Partial<T>): void {
    this.set({ ...this.value, ...value } as T);
  }
  private commit(value: T, persist: boolean): void {
    const next = immutable(value);
    const previous = this.value;
    this.value = next;
    this.revision++;
    const config = this.persistence;
    if (persist && config)
      this.writes = this.writes
        .then(() => config.storage.set(config.key, next as Json))
        .catch((error) => {
          this.failures.push(error);
        });
    const errors: unknown[] = [];
    for (const listener of [...this.listeners]) {
      try {
        listener(next, previous);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, "State committed; subscriber failures");
  }
  subscribe(listener: StateListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.unsubscribe(listener);
  }
  unsubscribe(listener: StateListener<T>): void {
    this.listeners.delete(listener);
  }
  async hydrate(): Promise<void> {
    const config = this.persistence;
    if (!config) return;
    const revision = this.revision;
    await this.flush();
    const stored = await config.storage.get(config.key);
    if (stored !== undefined && revision === this.revision)
      this.commit(config.decode(stored), false);
  }
  async flush(): Promise<void> {
    await this.writes;
    if (this.failures.length)
      throw new AggregateError(
        this.failures.splice(0),
        "State persistence failed",
      );
  }
}
