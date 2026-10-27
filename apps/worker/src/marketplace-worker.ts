import type { Env } from "./types";
import { marketplaceApi, reconcilePayments } from "./marketplace";
export default {
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(reconcilePayments(env));
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const expected = env.MARKETPLACE_ORIGIN;
    const headers = new Headers({
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    });
    if (origin && origin === expected) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
    }
    if (
      (origin && origin !== expected) ||
      (request.method === "POST" && origin !== expected)
    )
      return Response.json(
        { error: "Origin not allowed" },
        { status: 403, headers },
      );
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (!url.pathname.startsWith("/api/"))
      return Response.json({ error: "Not found" }, { status: 404, headers });
    try {
      const response = await marketplaceApi(request, env);
      headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    } catch (error) {
      const malformed =
        error instanceof SyntaxError ||
        (error instanceof Error &&
          ["Expected a JSON object", "Request is too large"].includes(
            error.message,
          ));
      return Response.json(
        {
          error: malformed
            ? "Invalid request body"
            : "Marketplace service is temporarily unavailable",
        },
        { status: malformed ? 400 : 503, headers },
      );
    }
  },
} satisfies ExportedHandler<Env>;
