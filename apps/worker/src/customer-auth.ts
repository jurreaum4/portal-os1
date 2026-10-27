import type { Env } from "./types";
import { sha256 } from "./access";
export interface Customer {
  id: string;
  name: string;
}
export function cookie(request: Request, name: string) {
  return (
    (request.headers.get("Cookie") ?? "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}
export function sessionCookie(
  request: Request,
  name: string,
  value: string,
  seconds: number,
) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function customer(
  request: Request,
  env: Env,
): Promise<Customer | null> {
  const token = cookie(request, "max_session");
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare(
    "SELECT c.id,c.name FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>?",
  )
    .bind(await sha256(token), Date.now())
    .first<Customer>();
}
export async function readObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Expected a JSON object");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new Error("Request is too large");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object");
  return value as Record<string, unknown>;
}
export function randomToken() {
  return (
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "")
  );
}
export async function customerAuth(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (!path.startsWith("/api/auth/")) return null;
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (path === "/api/auth/logout") {
    await env.DB.prepare("DELETE FROM customer_sessions WHERE token_hash=?")
      .bind(await sha256(cookie(request, "max_session")))
      .run();
    return Response.json(
      { success: true },
      {
        headers: { "Set-Cookie": sessionCookie(request, "max_session", "", 0) },
      },
    );
  }
  if (!["/api/auth/start", "/api/auth/complete"].includes(path))
    return Response.json({ error: "Not found" }, { status: 404 });
  if (!env.CUSTOMER_IDENTITY || !env.MARKETPLACE_ORIGIN)
    return Response.json(
      { error: "Customer sign-in is not configured yet" },
      { status: 503 },
    );
  const redirectUri = `${env.MARKETPLACE_ORIGIN.replace(/\/$/, "")}/account`;
  if (path === "/api/auth/start") {
    const state = randomToken();
    const response = await env.CUSTOMER_IDENTITY.fetch(
      "https://identity.internal/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, redirectUri }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      return Response.json(
        { error: "Sign-in provider is unavailable" },
        { status: 503 },
      );
    const result = (await response.json()) as { url?: unknown };
    if (typeof result.url !== "string" || !/^https:\/\//.test(result.url))
      throw new Error("Invalid identity redirect");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM login_challenges WHERE expires_at<=?").bind(
        Date.now(),
      ),
      env.DB.prepare("INSERT INTO login_challenges VALUES (?,?)").bind(
        await sha256(state),
        Date.now() + 600_000,
      ),
    ]);
    return Response.json(
      { url: result.url },
      {
        headers: {
          "Set-Cookie": sessionCookie(request, "max_login", state, 600),
        },
      },
    );
  }
  const body = await readObject(request);
  if (
    typeof body.state !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.state) ||
    body.state !== cookie(request, "max_login") ||
    typeof body.code !== "string" ||
    body.code.length < 1 ||
    body.code.length > 4000
  )
    return Response.json(
      { error: "Invalid sign-in response" },
      { status: 400 },
    );
  const claimed = await env.DB.prepare(
    "DELETE FROM login_challenges WHERE state_hash=? AND expires_at>? RETURNING state_hash",
  )
    .bind(await sha256(body.state), Date.now())
    .first();
  if (!claimed)
    return Response.json(
      { error: "Sign-in expired; please start again" },
      { status: 401 },
    );
  const response = await env.CUSTOMER_IDENTITY.fetch(
    "https://identity.internal/exchange",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: body.code, redirectUri }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    return Response.json(
      { error: "Sign-in could not be verified" },
      { status: 401 },
    );
  const identity = (await response.json()) as {
    subject?: unknown;
    name?: unknown;
  };
  if (
    typeof identity.subject !== "string" ||
    identity.subject.length < 1 ||
    identity.subject.length > 200 ||
    typeof identity.name !== "string" ||
    identity.name.length < 1 ||
    identity.name.length > 120
  )
    throw new Error("Invalid verified identity");
  const id = `customer:${await sha256(identity.subject)}`;
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO customer_accounts(id,identity_subject,name) VALUES (?,?,?) ON CONFLICT(identity_subject) DO NOTHING",
    ).bind(id, identity.subject, identity.name),
    env.DB.prepare("DELETE FROM customer_sessions WHERE expires_at<=?").bind(
      Date.now(),
    ),
    env.DB.prepare("INSERT INTO customer_sessions VALUES (?,?,?)").bind(
      await sha256(token),
      id,
      Date.now() + 86_400_000,
    ),
  ]);
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    sessionCookie(request, "max_session", token, 86400),
  );
  headers.append("Set-Cookie", sessionCookie(request, "max_login", "", 0));
  return Response.json({ id, name: identity.name }, { headers });
}
