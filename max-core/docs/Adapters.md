# Platform adapters

Every adapter exposes the same AdapterContract: platform plus StorageAdapter, TelemetryAdapter, NotificationAdapter, and PurchaseAdapter. Factories live under `adapters/web`, `adapters/ios`, `adapters/android`, and `adapters/desktop` and are exported from the main entry point.

```ts
import { createAndroidAdapter } from "max-core";
const adapter = createAndroidAdapter({
  storage: nativeStorage,
  telemetry: { track: (event, properties) => host.track(event, properties) },
  notifications: { notify: (title, body) => host.notify(title, body) },
  purchases: { purchase: (productId) => host.purchase(productId) },
});
```

| Factory              | Expected host integration                                |
| -------------------- | -------------------------------------------------------- |
| createWebAdapter     | IndexedDB and browser/provider capabilities              |
| createIOSAdapter     | iOS bridge for storage, notifications, and purchases     |
| createAndroidAdapter | Android bridge for storage, notifications, and purchases |
| createDesktopAdapter | Desktop host bridge and persistent storage               |

Factories compose explicitly supplied bridges. They do not claim that StoreKit, Play Billing, push services, telemetry providers, or desktop IPC have been installed. Platform SDKs and their lifecycle/permission handling belong to the host. The purchase result contains a transaction ID; verification, entitlements, refunds, and provider-specific rules belong to the integrating product/backend.

For unsupported operations, use `unsupportedCapabilities(storage)` and override any supported capabilities. Unsupported telemetry, notifications, and purchases reject with `UnsupportedCapabilityError`; no fake success is returned. Tests check all four factories against the same contract. Native device integration requires the host bridges and device testing.

Browser-only IndexedDB types are isolated in the `max-core/indexeddb` export; the default core entry point requires only ES2022 types. Native and Worker consumers can use their own StorageContract implementation without DOM libraries.
