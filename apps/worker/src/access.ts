import type { Env } from "./types";

export type StaffRole = "Governor" | "Admin" | "Operator" | "Read Only";
export interface StaffIdentity {
  id: string;
  role: StaffRole;
}
interface AutomationIdentity {
  id: string;
  role: "Automation";
}
const roles: StaffRole[] = ["Governor", "Admin", "Operator", "Read Only"];
export async function sha256(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function staffIdentity(
  request: Request,
  env: Env,
): Promise<StaffIdentity | null> {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ") || header.length > 4096) return null;
  const digest = await sha256(header.slice(7));
  // Retain the existing governor credential while supporting individually named staff.
  if (
    env.GOVERNOR_API_TOKEN &&
    equal(digest, await sha256(env.GOVERNOR_API_TOKEN))
  )
    return { id: "governor", role: "Governor" };
  if (!env.STAFF_CREDENTIALS) return null;
  let configured: unknown;
  try {
    configured = JSON.parse(env.STAFF_CREDENTIALS);
  } catch {
    return null;
  }
  if (!Array.isArray(configured) || configured.length > 100) return null;
  for (const entry of configured) {
    if (
      entry &&
      typeof entry.id === "string" &&
      entry.id.length <= 120 &&
      roles.includes(entry.role) &&
      typeof entry.tokenSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(entry.tokenSha256) &&
      equal(digest, entry.tokenSha256)
    )
      return { id: entry.id, role: entry.role };
  }
  return null;
}
export async function protectPortal(
  request: Request,
  env: Env,
): Promise<StaffIdentity | AutomationIdentity | Response> {
  if (
    !env.GOVERNOR_API_TOKEN &&
    !env.STAFF_CREDENTIALS &&
    !env.AUTOMATION_CREDENTIALS
  )
    return Response.json(
      { error: "Staff access is not configured" },
      { status: 503 },
    );
  const identity = await staffIdentity(request, env);
  if (!identity && env.AUTOMATION_CREDENTIALS) {
    let configured: unknown;
    try {
      configured = JSON.parse(env.AUTOMATION_CREDENTIALS);
    } catch {
      configured = [];
    }
    const header = request.headers.get("Authorization") ?? "";
    if (
      Array.isArray(configured) &&
      configured.length <= 100 &&
      header.startsWith("Bearer ") &&
      header.length <= 4096
    ) {
      const digest = await sha256(header.slice(7));
      for (const entry of configured) {
        if (
          entry &&
          typeof entry.id === "string" &&
          entry.id.length > 0 &&
          entry.id.length <= 120 &&
          typeof entry.tokenSha256 === "string" &&
          /^[a-f0-9]{64}$/.test(entry.tokenSha256) &&
          equal(digest, entry.tokenSha256)
        ) {
          const path = new URL(request.url).pathname;
          const scope =
            path === "/api/twin/telemetry"
              ? "telemetry:write"
              : path === "/api/twin/relationships" ||
                  /^\/api\/twin\/relationships\/[^/]+\/retire$/.test(path)
                ? "relationships:write"
                : null;
          if (
            request.method === "POST" &&
            scope &&
            Array.isArray(entry.scopes) &&
            entry.scopes.includes(scope)
          )
            return { id: entry.id, role: "Automation" };
          return Response.json(
            { error: "Automation scope does not permit this request" },
            { status: 403 },
          );
        }
      }
    }
  }
  if (!identity)
    return Response.json({ error: "Staff sign-in required" }, { status: 401 });
  const path = new URL(request.url).pathname;
  const governorOnly =
    request.method !== "GET" || ["/api/decisions"].includes(path);
  if (governorOnly && identity.role !== "Governor")
    return Response.json(
      { error: "Governor permission required" },
      { status: 403 },
    );
  return identity;
}
export async function auditAccess(
  env: Env,
  request: Request,
  identity: StaffIdentity | AutomationIdentity | null,
  status: number,
) {
  await env.DB.prepare(
    "INSERT INTO access_audit(id,actor,action,resource,status) VALUES (?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      identity?.id ?? "anonymous",
      request.method,
      new URL(request.url).pathname,
      status,
    )
    .run();
}
