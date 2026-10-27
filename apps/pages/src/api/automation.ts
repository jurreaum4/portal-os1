import { api } from "./client";
import type {
  AutomationSummary,
  AutomationProject,
} from "../../../automation-contract";
export const getAutomation = (signal?: AbortSignal) =>
  api<AutomationSummary>("/api/automation", { signal });
export const getAutomationProject = (id: string, signal?: AbortSignal) =>
  api<AutomationProject>(`/api/automation/projects/${encodeURIComponent(id)}`, {
    signal,
  });
