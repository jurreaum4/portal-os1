import { loadDefinition } from "./icvs/definition";
import { captureUniverse } from "./universe/graph";
import kernel from "./kernel";
import { routeApi } from "./routes/api";
import type { Env } from "./types";
export { ProductFactoryActor } from "./factory";
export { MicrokernelProcessActor } from "./kernel";

export default {
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(captureUniverse(env));
    ctx.waitUntil(
      (async () => {
        if (!env.FACTORY_ACTOR) return;
        // Reconcile intake committed before actor activation, including pre-upgrade ideas.
        const definition = await loadDefinition(env.DB);
        const ideas = await env.DB.prepare(
          `SELECT p.id FROM products p WHERE (p.stage IN (?,'Idea','Discovery','Validation') OR
          (p.stage='Build' AND EXISTS (SELECT 1 FROM factory_runs r WHERE r.product_id=p.id AND r.status IN ('running','blocked'))))
        AND length(trim(p.description)) >= 20 AND length(trim(p.name)) >= 2
        AND NOT EXISTS (SELECT 1 FROM workflow_events e WHERE e.product_id=p.id)
        ORDER BY p.updated_at,p.id LIMIT 50`,
        )
          .bind(definition.steps[0].stage)
          .all<{ id: string }>();
        await Promise.all(
          ideas.results.map(async ({ id }) => {
            const response = await env
              .FACTORY_ACTOR!.get(env.FACTORY_ACTOR!.idFromName(id))
              .fetch("https://factory.internal/run", {
                method: "POST",
                body: JSON.stringify({ productId: id }),
              });
            if (!response.ok)
              throw new Error(`ICVS reconciliation failed: ${response.status}`);
          }),
        );
      })(),
    );
  },
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (!path.startsWith("/api/") || path.startsWith("/api/kernel/"))
      return kernel.fetch(request, env, ctx);

    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim());

    const headers = new Headers({
      Vary: "Origin",
      "Cache-Control": "no-store",
    });

    if (origin && allowed.includes(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
    }

    if (origin && !allowed.includes(origin))
      return Response.json(
        { error: "Origin not allowed" },
        { status: 403, headers },
      );

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });

    try {
      const upstream = await routeApi(request, env);
      const response = new Response(upstream.body, upstream);
      headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[portal-os1] worker request failure", {
        method: request.method,
        url: request.url,
        bindingNames: Object.keys(env ?? {}),
        message: err.message,
        stack: err.stack ?? "",
        sql:
          typeof (error as any)?.cause === "object" &&
          "sql" in ((error as any).cause ?? {})
            ? String((error as any).cause.sql)
            : undefined,
      });

      return Response.json(
        { error: "Portal data is unavailable" },
        { status: 500, headers },
      );
    }
  },
} satisfies ExportedHandler<Env>;
