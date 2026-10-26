import type { DeepReadonly, Json } from "../contracts/index.js";
/** Validate and copy without a browser, structuredClone, or serialization hooks. */
export function copyJson<T>(value: T, ancestors = new Set<object>()): T {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value !== "object" ||
    ancestors.has(value) ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError("Expected finite, acyclic JSON data");
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return Array.from(value, (item) => copyJson(item, ancestors)) as T;
    const result: Record<string, Json> = {};
    for (const key of Object.keys(value))
      Object.defineProperty(result, key, {
        value: copyJson((value as Record<string, Json>)[key], ancestors),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    return result as T;
  } finally {
    ancestors.delete(value);
  }
}
export function immutable<T>(value: T): DeepReadonly<T> {
  const result = copyJson(value);
  const freeze = (item: unknown): void => {
    if (item !== null && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(result);
  return result as DeepReadonly<T>;
}
