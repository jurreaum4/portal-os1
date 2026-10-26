import { api } from "./client";
import type { Approval } from "../types";
export const getApprovals = (signal?: AbortSignal) =>
  api<Approval[]>("/api/approvals", { signal });
const decide = (id: string, action: string, token: string) =>
  api<{ success: boolean; status: string }>(
    `/api/approvals/${encodeURIComponent(id)}/${action}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
export const approve = (id: string, token: string) =>
  decide(id, "approve", token);
export const reject = (id: string, token: string) =>
  decide(id, "reject", token);

export const override = (id: string, token: string, reason: string) =>
  api<{ success: boolean; status: string }>(
    `/api/approvals/${encodeURIComponent(id)}/override`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    },
  );
