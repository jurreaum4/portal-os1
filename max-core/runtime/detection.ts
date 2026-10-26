import type { Platform } from "../contracts/index.js";
export interface DetectionEnvironment {
  platform?: Platform;
  userAgent?: string;
  maxTouchPoints?: number;
  wasm?: boolean;
  webgl?: boolean;
  webgpu?: boolean;
  standalone?: boolean;
  persistence?: { persisted(): Promise<boolean> };
}
export type Browser = "safari" | "chrome" | "firefox" | "edge" | "unknown";
/** Probes are guarded: absence, private mode, or denial is a supported outcome. */
export function browserEnvironment(): DetectionEnvironment {
  const host = globalThis as unknown as {
    navigator?: {
      userAgent?: string;
      maxTouchPoints?: number;
      standalone?: boolean;
      gpu?: unknown;
      storage?: { persisted(): Promise<boolean> };
    };
    document?: {
      createElement(tag: string): {
        getContext(kind: string): {
          getExtension(name: string): { loseContext(): void } | null;
        } | null;
      };
    };
    matchMedia?: (query: string) => { matches: boolean };
    WebAssembly?: unknown;
  };
  const navigator = host.navigator;
  if (!navigator || (!host.document && !host.matchMedia)) return {};
  let webgl = false;
  try {
    const canvas = host.document?.createElement("canvas");
    const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    webgl = !!context;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    /* No rendering context. */
  }
  let pwa = false;
  try {
    pwa =
      host.matchMedia?.("(display-mode: standalone)").matches === true ||
      navigator.standalone === true;
  } catch {
    /* Restricted host. */
  }
  const result: DetectionEnvironment = {
    userAgent: navigator.userAgent ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    wasm: host.WebAssembly !== undefined,
    webgl,
    webgpu: navigator.gpu !== undefined,
    standalone: pwa,
  };
  try {
    if (navigator.storage) result.persistence = navigator.storage;
  } catch {
    /* Restricted storage. */
  }
  return result;
}
export function detectPlatform(
  environment: DetectionEnvironment = browserEnvironment(),
): Platform {
  if (environment.platform) return environment.platform;
  const ua = environment.userAgent ?? "";
  if (/android/i.test(ua)) return "android";
  if (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && (environment.maxTouchPoints ?? 0) > 1)
  )
    return "ios";
  return ua ? "web" : "unknown";
}
export function detectBrowser(
  environment: DetectionEnvironment = browserEnvironment(),
): Browser {
  const ua = environment.userAgent ?? "";
  if (/edg(e|a|ios)?\//i.test(ua)) return "edge";
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/chrome|crios|chromium/i.test(ua)) return "chrome";
  if (/safari/i.test(ua)) return "safari";
  return "unknown";
}
export function detectRenderer(
  environment: DetectionEnvironment = browserEnvironment(),
): { wasm: boolean; webgl: boolean; webgpu: boolean } {
  return {
    wasm: environment.wasm === true,
    webgl: environment.webgl === true,
    webgpu: environment.webgpu === true,
  };
}
export async function detectPersistence(
  environment: DetectionEnvironment = browserEnvironment(),
): Promise<boolean> {
  try {
    return (await environment.persistence?.persisted()) === true;
  } catch {
    return false;
  }
}
export async function detectRuntime(
  environment: DetectionEnvironment = browserEnvironment(),
) {
  const platform = detectPlatform(environment);
  const browser = detectBrowser(environment);
  const renderer = detectRenderer(environment);
  const safe = browser === "safari" || platform === "ios";
  return {
    platform,
    browser,
    ...renderer,
    pwa: environment.standalone === true,
    persistentStorage: await detectPersistence(environment),
    policy: {
      memorySafeMode: safe,
      storageSafeMode: safe,
      imageFallbackMode: safe,
      compute:
        platform === "android" && renderer.wasm
          ? ("wasm" as const)
          : ("javascript" as const),
      renderer:
        platform === "android" && renderer.webgpu
          ? ("webgpu" as const)
          : renderer.webgl
            ? ("webgl" as const)
            : ("image" as const),
    },
  };
}
