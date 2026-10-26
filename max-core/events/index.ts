import type { EventContract } from "../contracts/index.js";
export class Event<E extends object> implements EventContract<E> {
  private routes = new Map<keyof E, Set<(payload: never) => void>>();
  subscribe<K extends keyof E>(
    name: K,
    listener: (payload: E[K]) => void,
  ): () => void {
    let route = this.routes.get(name);
    if (!route) {
      route = new Set();
      this.routes.set(name, route);
    }
    route.add(listener as (payload: never) => void);
    return () => this.unsubscribe(name, listener);
  }
  unsubscribe<K extends keyof E>(
    name: K,
    listener: (payload: E[K]) => void,
  ): void {
    const route = this.routes.get(name);
    route?.delete(listener as (payload: never) => void);
    if (!route?.size) this.routes.delete(name);
  }
  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const errors: unknown[] = [];
    for (const listener of [...(this.routes.get(name) ?? [])]) {
      try {
        listener(payload as never);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, "Event subscriber failures");
  }
}
