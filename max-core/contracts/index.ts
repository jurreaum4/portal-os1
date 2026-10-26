/** Portable values are finite JSON data; undefined, cycles and class instances are rejected. */
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type Unsubscribe = () => void;
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export type StateListener<T> = (
  value: DeepReadonly<T>,
  previous: DeepReadonly<T>,
) => void;
/** Mutations commit synchronously; flush explicitly awaits persistence. */
export interface StateContract<T extends object> {
  get(): DeepReadonly<T>;
  set(value: T): void;
  patch(value: Partial<T>): void;
  subscribe(listener: StateListener<T>): Unsubscribe;
  unsubscribe(listener: StateListener<T>): void;
  hydrate(): Promise<void>;
  flush(): Promise<void>;
}
/** One shared bus instance provides global routing without global mutable state. */
export interface EventContract<E extends object> {
  emit<K extends keyof E>(name: K, payload: E[K]): void;
  subscribe<K extends keyof E>(
    name: K,
    listener: (payload: E[K]) => void,
  ): Unsubscribe;
  unsubscribe<K extends keyof E>(
    name: K,
    listener: (payload: E[K]) => void,
  ): void;
}
export type SimulationStatus = "stopped" | "running" | "paused";
/** update advances a fixed number of steps, never wall-clock time. */
export interface SimulationContract<T> {
  readonly status: SimulationStatus;
  readonly tick: number;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  update(steps?: number): DeepReadonly<T>;
}
/** Atomic replacement of a single key; missing keys return undefined. */
export interface StorageContract {
  get(key: string): Promise<Json | undefined>;
  set(key: string, value: Json): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface Service {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
}
export interface RuntimeContract {
  readonly running: boolean;
  boot(): Promise<void>;
  shutdown(): Promise<void>;
}
export type Platform = "web" | "ios" | "android" | "desktop" | "unknown";
export interface PlatformAdapter {
  readonly platform: Platform;
}
export interface StorageAdapter extends StorageContract {}
export interface TelemetryAdapter {
  track(
    event: string,
    properties: Readonly<Record<string, Json>>,
  ): Promise<void>;
}
export interface NotificationAdapter {
  notify(title: string, body: string): Promise<void>;
}
export interface PurchaseAdapter {
  purchase(productId: string): Promise<{ transactionId: string }>;
}
/** Hosts explicitly provide native/privileged capabilities. */
export interface AdapterContract extends PlatformAdapter {
  readonly storage: StorageAdapter;
  readonly telemetry: TelemetryAdapter;
  readonly notifications: NotificationAdapter;
  readonly purchases: PurchaseAdapter;
}
