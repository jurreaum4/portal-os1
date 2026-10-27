import type { Env } from "../types";
export type UniverseRole = "viewer" | "automation" | "governor";
export interface Identity {
  id: string;
  name: string;
  role: UniverseRole | "member";
}
export async function identityOf(
  request: Request,
  env: Env,
): Promise<Identity | null> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 4096)
    return null;
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const actual = await digest(authorization.slice(7));
  const entries: [UniverseRole, string | undefined][] = [
    ["governor", env.GOVERNOR_API_TOKEN],
    ["automation", env.UNIVERSE_AUTOMATION_TOKEN],
    ["viewer", env.UNIVERSE_VIEWER_TOKEN],
  ];
  for (const [role, token] of entries) {
    if (!token) continue;
    const expected = await digest(token);
    if (actual.reduce((d, b, i) => d | (b ^ expected[i]), 0) === 0)
      return { id: `service:${role}`, name: `${role} service`, role };
  }
  const hash = Array.from(actual, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return env.DB.prepare(
    "SELECT id,name,role FROM icv_principals WHERE token_hash=? AND disabled=0",
  )
    .bind(hash)
    .first<Identity>();
}
export async function roleOf(
  request: Request,
  env: Env,
): Promise<UniverseRole | null> {
  const identity = await identityOf(request, env);
  return identity && identity.role !== "member" ? identity.role : null;
}
