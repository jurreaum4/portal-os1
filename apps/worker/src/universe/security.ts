import type { Env } from "../types";
export type UniverseRole = "viewer" | "automation" | "governor";
export async function roleOf(
  request: Request,
  env: Env,
): Promise<UniverseRole | null> {
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const actual = await digest(request.headers.get("Authorization") ?? "");
  const entries: [UniverseRole, string | undefined][] = [
    ["governor", env.GOVERNOR_API_TOKEN],
    ["automation", env.UNIVERSE_AUTOMATION_TOKEN],
    ["viewer", env.UNIVERSE_VIEWER_TOKEN],
  ];
  for (const [role, token] of entries) {
    if (!token) continue;
    const expected = await digest(`Bearer ${token}`);
    if (actual.reduce((d, b, i) => d | (b ^ expected[i]), 0) === 0) return role;
  }
  return null;
}
