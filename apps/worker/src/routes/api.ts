import { authorised } from "../services/authorisation";
import { ingestObservation } from "../services/observations";
import type { Env } from "../types";
import { consoleSnapshot, systemHealth } from "../services/console";

const productColumns =
  "id, name, description, stage, score, updated_at AS updatedAt";
const stages = ["Idea", "Validation", "Build", "Ready", "Live", "Archived"];
const json = (value: unknown, status = 200) => Response.json(value, { status });

export async function routeApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/api/telemetry" && request.method === "POST")
    return ingestObservation(request, env);
  if (path === "/api/system-health" && request.method === "GET")
    return json(await systemHealth(env));
  if (!env.DB) return json({ error: "Storage is not configured" }, 503);
  if (path === "/api/console" && request.method === "GET")
    return json(await consoleSnapshot(env.DB));
  if (path === "/api/session") {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    if (!env.GOVERNOR_API_TOKEN)
      return json({ error: "Governor access is not configured" }, 503);
    return (await authorised(request, env.GOVERNOR_API_TOKEN))
      ? json({ authenticated: true })
      : json({ error: "Invalid governor token" }, 401);
  }
  if (path === "/api/decisions") {
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);
    if (
      !env.GOVERNOR_API_TOKEN ||
      !(await authorised(request, env.GOVERNOR_API_TOKEN))
    )
      return json({ error: "Governor authorization required" }, 401);
    return json(
      (
        await env.DB.prepare(
          "SELECT d.id,a.product_id AS productId,p.name AS project,a.action AS request,d.action,d.reason,d.decided_at AS decidedAt FROM governor_decisions d JOIN approvals a ON a.id=d.approval_id JOIN products p ON p.id=a.product_id ORDER BY d.id DESC LIMIT 100",
        ).all()
      ).results,
    );
  }
  const decision = path.match(
    /^\/api\/approvals\/([^/]+)\/(approve|reject|override)$/,
  );
  if (decision) {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    if (!env.GOVERNOR_API_TOKEN)
      return json({ error: "Governor decisions are not configured" }, 503);
    if (!(await authorised(request, env.GOVERNOR_API_TOKEN)))
      return json({ error: "Governor authorization required" }, 401);
    let id: string;
    try {
      id = decodeURIComponent(decision[1]);
    } catch {
      return json({ error: "Invalid approval ID" }, 400);
    }
    let reason: string | null = null;
    if (decision[2] === "override") {
      try {
        const body: unknown = await request.json();
        if (
          !body ||
          typeof body !== "object" ||
          !("reason" in body) ||
          typeof body.reason !== "string" ||
          body.reason.trim().length < 10 ||
          body.reason.trim().length > 1000
        )
          return json(
            { error: "Override requires a reason of 10–1000 characters" },
            400,
          );
        reason = body.reason.trim();
      } catch {
        return json({ error: "Invalid override request" }, 400);
      }
    }
    const status = decision[2] === "reject" ? "rejected" : "approved";
    const result = await env.DB.prepare(
      "UPDATE approvals SET status = ?, decision_kind = ?, decision_reason = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
    )
      .bind(status, decision[2], reason, id)
      .run();
    if (result.meta.changes === 0) {
      const exists = await env.DB.prepare(
        "SELECT id FROM approvals WHERE id = ?",
      )
        .bind(id)
        .first();
      return json(
        {
          error: exists
            ? "Approval has already been decided"
            : "Approval not found",
        },
        exists ? 409 : 404,
      );
    }
    return json({ success: true, status });
  }
  if (request.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  if (path === "/api/products")
    return json(
      (
        await env.DB.prepare(
          `SELECT ${productColumns} FROM products ORDER BY name`,
        ).all()
      ).results,
    );
  const product = path.match(/^\/api\/products\/([^/]+)$/);
  if (product) {
    let id: string;
    try {
      id = decodeURIComponent(product[1]);
    } catch {
      return json({ error: "Invalid product ID" }, 400);
    }
    const row = await env.DB.prepare(
      `SELECT ${productColumns} FROM products WHERE id = ?`,
    )
      .bind(id)
      .first();
    return row ? json(row) : json({ error: "Product not found" }, 404);
  }
  if (path === "/api/approvals")
    return json(
      (
        await env.DB.prepare(
          `SELECT a.id, a.product_id AS productId, p.name AS project, a.action, a.priority, a.risk, a.status FROM approvals a JOIN products p ON p.id = a.product_id WHERE a.status = 'pending' ORDER BY CASE a.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, a.created_at, a.id`,
        ).all()
      ).results,
    );
  if (path === "/api/portfolio")
    return json(
      (
        await env.DB.prepare(
          `SELECT ${productColumns} FROM products ORDER BY score DESC, name`,
        ).all()
      ).results,
    );
  if (path === "/api/pipeline") {
    const rows = (
      await env.DB.prepare(
        `SELECT ${productColumns} FROM products ORDER BY name`,
      ).all<{ stage: string }>()
    ).results;
    return json(
      stages.map((stage) => ({
        stage,
        products: rows.filter((row) => row.stage === stage),
      })),
    );
  }
  if (path === "/api/dashboard") {
    try {
      const productsQuery = `
        SELECT
          COUNT(*) AS projects,
          COALESCE(SUM(stage = 'Live'),0) AS activeProducts,
          COALESCE(SUM(stage = 'Ready'),0) AS readyToPublish
        FROM products
      `;

      const approvalsQuery = `
        SELECT COUNT(*) AS approvals
        FROM approvals
        WHERE status = 'pending'
      `;

      const healthQuery = `
        SELECT ROUND(
          100.0 * SUM(
            state IN ('READY', 'RUNNING', 'SUSPENDED')
          ) / NULLIF(COUNT(*),0)
        ) AS health
        FROM virtual_processes
      `;

      const products = await env.DB.prepare(productsQuery).first<{
        projects: number | null;
        activeProducts: number | null;
        readyToPublish: number | null;
      }>();
      const approvals = await env.DB.prepare(approvalsQuery).first<{
        approvals: number | null;
      }>();

      let health = { health: null as number | null };

      try {
        const result = await env.DB.prepare(healthQuery).first<{
          health: number | null;
        }>();

        if (result && result.health !== null) {
          health = { health: result.health };
        }
      } catch (error) {
        console.error(
          JSON.stringify({
            endpoint: "/api/dashboard",
            query: "virtual_processes health",
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }),
        );
      }

      return json({
        ...(products ?? {}),
        ...(approvals ?? {}),
        ...health,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          endpoint: "/api/dashboard",
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );

      return json({ error: "Portal data is unavailable" }, 500);
    }
  }
  if (path === "/api/analytics")
    return json(
      (
        await env.DB.prepare(
          "SELECT stage, COUNT(*) AS count, ROUND(AVG(score),1) AS averageScore FROM products GROUP BY stage ORDER BY stage",
        ).all()
      ).results,
    );
  if (path === "/api/telemetry")
    return json(
      (
        await env.DB.prepare(
          "SELECT state, COUNT(*) AS count FROM virtual_processes GROUP BY state ORDER BY state",
        ).all()
      ).results,
    );
  if (path === "/api/governance")
    return json(
      (
        await env.DB.prepare(
          "SELECT status, COUNT(*) AS count FROM approvals GROUP BY status ORDER BY status",
        ).all()
      ).results,
    );
  return json({ error: "API route not found" }, 404);
}
