import { orderedLifecycleStages } from "../icvs/definition";
import { marketplaceApi } from "../universe/marketplace";
import { identityOf } from "../universe/security";
import { bemaxApi } from "../universe/bemax";
import { universeApi } from "../universe/api";
import type { Env } from "../types";

import { operationalApi, authorize, productColumns } from "../operations";
const json = (value: unknown, status = 200) => Response.json(value, { status });

export async function routeApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/api/icv/me") {
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);
    const identity = await identityOf(request, env);
    return identity
      ? json(identity)
      : json({ error: "Identity required" }, 401);
  }
  const marketplace = await marketplaceApi(request, env);
  if (marketplace) return marketplace;
  const bemax = await bemaxApi(request, env);
  if (bemax) return bemax;
  const universe = await universeApi(request, env);
  if (universe) return universe;
  const operational = await operationalApi(request, env);
  if (operational) return operational;
  const reversal = path.match(/^\/api\/factory\/([^/]+)\/override$/);
  if (reversal) {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    const denied = await authorize(request, env);
    if (denied) return denied;
    let body: {
      eventId?: unknown;
      reason?: unknown;
      expectedSequence?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (
      !body ||
      !Number.isSafeInteger(body.expectedSequence) ||
      typeof body.eventId !== "string" ||
      body.eventId.length > 200 ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 10 ||
      body.reason.length > 1000
    )
      return json(
        { error: "Event ID and reason of 10–1000 characters required" },
        400,
      );
    if (!env.FACTORY_ACTOR) return json({ error: "Factory unavailable" }, 503);
    let productId: string;
    try {
      productId = decodeURIComponent(reversal[1]);
    } catch {
      return json({ error: "Invalid product ID" }, 400);
    }
    return env.FACTORY_ACTOR.get(env.FACTORY_ACTOR.idFromName(productId)).fetch(
      "https://factory.internal/reverse",
      {
        method: "POST",
        body: JSON.stringify({
          productId,
          reverseEventId: body.eventId,
          expectedSequence: body.expectedSequence,
          note: body.reason.trim(),
          actor: (await identityOf(request, env))!.id.replace(/^service:/, ""),
        }),
      },
    );
  }
  const decision = path.match(
    /^\/api\/approvals\/([^/]+)\/(approve|reject|override)$/,
  );
  if (decision) {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    const denied = await authorize(request, env);
    if (denied) return denied;
    let note = "";
    if (decision[2] === "override") {
      try {
        const body = (await request.json()) as { reason?: unknown };
        if (
          typeof body?.reason !== "string" ||
          body.reason.trim().length < 10 ||
          body.reason.length > 1000
        )
          throw new Error();
        note = body.reason.trim();
      } catch {
        return json(
          { error: "An override reason of 10–1000 characters is required" },
          400,
        );
      }
    }
    let id: string;
    try {
      id = decodeURIComponent(decision[1]);
    } catch {
      return json({ error: "Invalid approval ID" }, 400);
    }
    const status =
      decision[2] === "approve"
        ? "approved"
        : decision[2] === "override"
          ? "overridden"
          : "rejected";
    const workflow = await env.DB.prepare(
      `SELECT a.product_id AS productId FROM workflow_approvals w
      JOIN approvals a ON a.id=w.approval_id WHERE w.approval_id=?`,
    )
      .bind(id)
      .first<{ productId: string }>();
    if (workflow) {
      if (!env.FACTORY_ACTOR)
        return json({ error: "Factory actor is unavailable" }, 503);
      return env.FACTORY_ACTOR.get(
        env.FACTORY_ACTOR.idFromName(workflow.productId),
      ).fetch("https://factory.internal/decision", {
        method: "POST",
        body: JSON.stringify({
          productId: workflow.productId,
          approvalId: id,
          status,
          note,
          actor: (await identityOf(request, env))!.id.replace(/^service:/, ""),
        }),
      });
    }
    const result = await env.DB.prepare(
      "UPDATE approvals SET status = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
    )
      .bind(status, note, id)
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
          `SELECT a.id, a.product_id AS productId, p.name AS project, a.action, a.priority, a.risk, a.status FROM approvals a JOIN products p ON p.id = a.product_id WHERE a.status = 'pending' ORDER BY CASE a.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, a.created_at DESC`,
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
    const stages = await orderedLifecycleStages(env.DB);
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
          COALESCE(SUM(stage IN ('Live','Published')),0) AS activeProducts,
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
  if (path === "/api/overview") {
    return json(
      await env.DB.prepare(
        `SELECT ROUND(AVG(score),1) AS portfolioScore,
      COALESCE(SUM(revenue),0) AS revenue, SUM(stage='Build') AS buildQueue,
      SUM(status='Attention') AS flagged, SUM(stage IN ('Live','Published')) AS published
      FROM products`,
      ).first(),
    );
  }
  if (path === "/api/decisions")
    return json(
      (
        await env.DB.prepare(
          "SELECT a.id, p.name AS project, a.action, a.status, a.decision_note AS note, a.decided_at AS decidedAt FROM approvals a JOIN products p ON p.id=a.product_id WHERE a.status!='pending' ORDER BY a.decided_at DESC LIMIT 50",
        ).all()
      ).results,
    );
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
