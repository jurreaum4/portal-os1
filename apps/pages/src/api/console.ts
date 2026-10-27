import { api } from "./client";
import type { ConsoleSnapshot, SystemHealth } from "../../../console-contract";
export const getConsole = (signal?: AbortSignal) =>
  api<ConsoleSnapshot>("/api/console", { signal });
export const getSystemHealth = (signal?: AbortSignal) =>
  api<SystemHealth>("/api/system-health", { signal });
