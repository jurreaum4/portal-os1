import type {
  AdapterContract,
  NotificationAdapter,
  Platform,
  PurchaseAdapter,
  StorageAdapter,
  TelemetryAdapter,
} from "../contracts/index.js";
export interface HostCapabilities {
  storage: StorageAdapter;
  telemetry: TelemetryAdapter;
  notifications: NotificationAdapter;
  purchases: PurchaseAdapter;
}
/** Unsupported host operations reject explicitly instead of claiming success. */
export class UnsupportedCapabilityError extends Error {
  constructor(capability: string) {
    super(`Unsupported capability: ${capability}`);
    this.name = "UnsupportedCapabilityError";
  }
}
export function unsupportedCapabilities(
  storage: StorageAdapter,
): HostCapabilities {
  return {
    storage,
    telemetry: {
      async track() {
        throw new UnsupportedCapabilityError("telemetry");
      },
    },
    notifications: {
      async notify() {
        throw new UnsupportedCapabilityError("notifications");
      },
    },
    purchases: {
      async purchase() {
        throw new UnsupportedCapabilityError("purchases");
      },
    },
  };
}
export function createAdapter(
  platform: Platform,
  capabilities: HostCapabilities,
): AdapterContract {
  return Object.freeze({ platform, ...capabilities });
}
export { createWebAdapter } from "./web/index.js";
export { createIOSAdapter } from "./ios/index.js";
export { createAndroidAdapter } from "./android/index.js";
export { createDesktopAdapter } from "./desktop/index.js";
