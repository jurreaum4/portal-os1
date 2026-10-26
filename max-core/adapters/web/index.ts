import { createAdapter, type HostCapabilities } from "../index.js";
import type { AdapterContract } from "../../contracts/index.js";
/** The host supplies storage and privileged bridges for web. */
export function createWebAdapter(
  capabilities: HostCapabilities,
): AdapterContract {
  return createAdapter("web", capabilities);
}
