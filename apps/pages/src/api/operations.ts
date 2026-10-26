import { api } from "./client";
import type {
  Deployment,
  Division,
  SystemHealth,
  Activity,
  Recommendation,
  Department,
  FactoryRun,
  FactoryOutput,
  Forecast,
} from "../types";
export const getDivisions = (signal?: AbortSignal) =>
  api<Division[]>("/api/divisions", { signal });
export const getHealth = (signal?: AbortSignal) =>
  api<SystemHealth>("/api/system-health", { signal });
export const getActivity = (signal?: AbortSignal) =>
  api<Activity[]>("/api/activity", { signal });
export const getRecommendations = (signal?: AbortSignal) =>
  api<Recommendation[]>("/api/recommendations", { signal });
export const getDepartments = (signal?: AbortSignal) =>
  api<Department[]>("/api/departments", { signal });
export const getFactory = (signal?: AbortSignal) =>
  api<FactoryRun[]>("/api/factory", { signal });
export const getForecasts = (signal?: AbortSignal) =>
  api<Forecast>("/api/forecasts", { signal });
export const getOutputs = (id: string, signal?: AbortSignal) =>
  api<FactoryOutput[]>(`/api/factory/${encodeURIComponent(id)}/outputs`, {
    signal,
  });
export const mutate = <T>(path: string, token: string, body?: unknown) =>
  api<T>(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const getDeployments = (signal?: AbortSignal) =>
  api<Deployment[]>("/api/deployments", { signal });
