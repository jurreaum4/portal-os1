import type { Env } from "./types";
export const lifecycle = [
  "Idea",
  "Discovery",
  "Specification",
  "Architecture",
  "Simulation",
  "Build",
  "Test",
  "Package",
  "Ready",
  "Published",
];
export const productColumns =
  "id, name, description, stage, score, updated_at AS updatedAt, division_id AS divisionId, revenue, status";
export async function authorize(
  request: Request,
  env: Env,
): Promise<Response | null> {
  if (!env.GOVERNOR_API_TOKEN)
    return Response.json(
      { error: "Governor decisions are not configured" },
      { status: 503 },
    );
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const [actual, expected] = await Promise.all([
    digest(request.headers.get("Authorization") ?? ""),
    digest(`Bearer ${env.GOVERNOR_API_TOKEN}`),
  ]);
  return actual.reduce((diff, byte, i) => diff | (byte ^ expected[i]), 0)
    ? Response.json(
        { error: "Governor authorization required" },
        { status: 401 },
      )
    : null;
}
export interface OperationalProduct {
  id: string;
  name: string;
  description: string;
  stage: string;
  score: number;
  divisionId: string;
  revenue: number;
  status: string;
}
export const departments = [
  {
    id: "GOV",
    name: "Governance",
    description: "Decisions, policy & accountability",
    stages: ["Ready"],
  },
  {
    id: "STRAT",
    name: "Strategy",
    description: "Opportunities & product discovery",
    stages: ["Idea", "Discovery", "Validation"],
  },
  {
    id: "ARCH",
    name: "Architecture",
    description: "Specifications & system design",
    stages: ["Specification", "Architecture", "Simulation"],
  },
  {
    id: "BUILD",
    name: "Build",
    description: "Engineering & product delivery",
    stages: ["Build"],
  },
  {
    id: "TEST",
    name: "Quality assurance",
    description: "Validation & release confidence",
    stages: ["Test"],
  },
  {
    id: "OPS",
    name: "Operations",
    description: "Packaging, releases & runtime",
    stages: ["Package"],
  },
  {
    id: "DATA",
    name: "Intelligence",
    description: "Portfolio signals & scoring",
    stages: [],
  },
  {
    id: "GROWTH",
    name: "Growth",
    description: "Published products & revenue",
    stages: ["Published", "Live"],
  },
];
export async function operationalApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const db = env.DB!;
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status });
  const mutation =
    path === "/api/intake" ||
    (path === "/api/divisions" && request.method === "POST") ||
    /^\/api\/factory\/[^/]+\/run$/.test(path);
  if (mutation) {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    const denied = await authorize(request, env);
    if (denied) return denied;
    if (path.startsWith("/api/factory/")) {
      if (!env.FACTORY_ACTOR)
        return json({ error: "Factory actor is unavailable" }, 503);
      let id: string;
      try {
        id = decodeURIComponent(path.split("/")[3]);
      } catch {
        return json({ error: "Invalid product ID" }, 400);
      }
      const actor = env.FACTORY_ACTOR.get(env.FACTORY_ACTOR.idFromName(id));
      return actor.fetch(
        new Request("https://factory.internal/run", {
          method: "POST",
          body: JSON.stringify({ productId: id }),
        }),
      );
    }
    let body: Record<string, unknown>;
    try {
      const input: unknown = await request.json();
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error();
      body = input as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON object" }, 400);
    }
    if (path === "/api/divisions") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 2 || name.length > 80)
        return json({ error: "Division name must be 2–80 characters" }, 400);
      const id = crypto.randomUUID();
      const result = await db
        .prepare(
          "INSERT INTO divisions (id,name) VALUES (?,?) ON CONFLICT(name) DO NOTHING",
        )
        .bind(id, name)
        .run();
      if (!result.meta.changes)
        return json({ error: "Division already exists" }, 409);
      return json({ id, name, color: "#6c62db" }, 201);
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    if (
      name.length < 2 ||
      name.length > 120 ||
      description.length < 20 ||
      description.length > 4000
    )
      return json(
        {
          error:
            "Use a name of 2–120 characters and a brief of 20–4000 characters",
        },
        400,
      );
    if (
      typeof body.divisionId !== "string" ||
      !(await db
        .prepare("SELECT id FROM divisions WHERE id=?")
        .bind(body.divisionId)
        .first())
    )
      return json({ error: "Choose an existing division" }, 400);
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "INSERT INTO products (id,name,description,division_id,stage) VALUES (?,?,?,?,'Idea')",
        )
        .bind(id, name, description, body.divisionId),
      db
        .prepare(
          "INSERT INTO activity (id,product_id,title,department) VALUES (?,?,?,'STRAT')",
        )
        .bind(crypto.randomUUID(), id, `${name} entered the intake queue`),
    ]);
    return json({ id }, 201);
  }
  if (request.method !== "GET") return null;
  if (path === "/api/divisions")
    return json(
      (
        await db
          .prepare("SELECT id,name,color FROM divisions ORDER BY rowid")
          .all()
      ).results,
    );
  if (path === "/api/runtime" || path === "/api/processes") {
    const processes = (
      await db
        .prepare(
          "SELECT pid, owner_id AS ownerId, state, last_heartbeat_epoch AS lastHeartbeat FROM virtual_processes ORDER BY last_heartbeat_epoch DESC",
        )
        .all()
    ).results;
    return json(
      path.endsWith("processes")
        ? processes
        : {
            processes,
            sampledAt: new Date().toISOString(),
            source: "Stored kernel process states",
          },
    );
  }
  if (path === "/api/system-health") {
    await db.prepare("SELECT 1").first();
    const runtime = await db
      .prepare(
        "SELECT COUNT(*) AS total, SUM(state='PANICKED') AS panicked FROM virtual_processes",
      )
      .first<{ total: number; panicked: number }>();
    return json({
      status: runtime?.panicked ? "Attention" : "Operational",
      sampledAt: new Date().toISOString(),
      services: [
        {
          name: "Worker API",
          status: "Operational",
          detail: "Request handled successfully",
        },
        {
          name: "D1 database",
          status: "Operational",
          detail: "Read query succeeded",
        },
        {
          name: "Durable Objects",
          status: env.MICROKERNEL_ACTOR ? "Configured" : "Not configured",
          detail: "Binding configuration; availability not probed",
        },
        {
          name: "Product runtime",
          status: !runtime?.total
            ? "No telemetry"
            : runtime.panicked
              ? "Attention"
              : "Healthy stored states",
          detail: `${runtime?.total ?? 0} stored processes`,
        },
      ],
    });
  }
  if (path === "/api/deployments")
    return json(
      (
        await db
          .prepare(
            "SELECT d.id,p.name,d.environment,d.status,d.created_at AS createdAt FROM deployments d JOIN products p ON p.id=d.product_id ORDER BY d.created_at DESC,d.rowid DESC LIMIT 20",
          )
          .all()
      ).results,
    );
  if (path === "/api/activity")
    return json(
      (
        await db
          .prepare(
            "SELECT id, product_id AS productId, title, department, kind, created_at AS createdAt FROM activity ORDER BY created_at DESC, rowid DESC LIMIT 30",
          )
          .all()
      ).results,
    );
  if (path === "/api/factory")
    return json(
      (
        await db
          .prepare(
            "SELECT r.id, r.product_id AS productId, p.name, r.status, r.stage, r.message, r.updated_at AS updatedAt FROM factory_runs r JOIN products p ON p.id=r.product_id ORDER BY r.created_at DESC, r.rowid DESC LIMIT 100",
          )
          .all()
      ).results,
    );
  const outputs = path.match(/^\/api\/factory\/([^/]+)\/outputs$/);
  if (outputs) {
    let id: string;
    try {
      id = decodeURIComponent(outputs[1]);
    } catch {
      return json({ error: "Invalid product ID" }, 400);
    }
    return json(
      (
        await db
          .prepare(
            "SELECT o.id,o.engine,o.content,o.created_at AS createdAt FROM factory_outputs o JOIN factory_runs r ON r.id=o.run_id WHERE r.product_id=? ORDER BY o.rowid",
          )
          .bind(id)
          .all()
      ).results,
    );
  }
  if (
    !["/api/forecasts", "/api/recommendations", "/api/departments"].includes(
      path,
    )
  )
    return null;
  const products = (
    await db
      .prepare(
        `SELECT ${productColumns} FROM products ORDER BY score DESC, name`,
      )
      .all<OperationalProduct>()
  ).results;
  if (path === "/api/forecasts") {
    const divisions = (
      await db
        .prepare("SELECT id,name FROM divisions ORDER BY rowid")
        .all<{ id: string; name: string }>()
    ).results;
    return json({
      method:
        "Scenario estimate: current monthly revenue × selected growth assumption. No historical trend is available.",
      divisions: divisions.map((d) => {
        const rows = products.filter((p) => p.divisionId === d.id);
        const revenue = rows.reduce((sum, p) => sum + p.revenue, 0);
        return {
          ...d,
          revenue,
          products: rows.length,
          ready: rows.filter((p) => p.stage === "Ready").length,
          conservative: revenue * 0.95,
          baseline: revenue,
          optimistic: revenue * 1.1,
        };
      }),
    });
  }
  if (path === "/api/recommendations")
    return json(
      products.flatMap((p) => {
        const reason =
          p.status === "Attention"
            ? "Resolve flagged product health before advancing."
            : p.stage === "Ready"
              ? "Review release readiness and the approval queue."
              : p.score >= 85 &&
                  !["Published", "Live", "Archived"].includes(p.stage)
                ? "Prioritize this high scoring opportunity in the delivery queue."
                : "";
        return reason
          ? [
              {
                id: p.id,
                productId: p.id,
                name: p.name,
                priority: p.status === "Attention" ? "High" : "Medium",
                reason,
                score: p.score,
              },
            ]
          : [];
      }),
    );
  const pending = await db
    .prepare("SELECT COUNT(*) AS count FROM approvals WHERE status='pending'")
    .first<{ count: number }>();
  return json(
    await Promise.all(
      departments.map(async (d) => {
        const queue = products.filter((p) => d.stages.includes(p.stage));
        const outputs = (
          await db
            .prepare(
              "SELECT id,title,created_at AS createdAt FROM activity WHERE department=? ORDER BY created_at DESC,rowid DESC LIMIT 5",
            )
            .bind(d.id)
            .all()
        ).results;
        return {
          ...d,
          status: queue.some((p) => p.status === "Attention")
            ? "Attention"
            : "Operational",
          queue,
          outputs,
          kpis: {
            queued: queue.length,
            averageScore: queue.length
              ? Math.round(
                  queue.reduce((s, p) => s + p.score, 0) / queue.length,
                )
              : null,
            pendingApprovals: d.id === "GOV" ? (pending?.count ?? 0) : null,
          },
          health: queue.some((p) => p.status === "Attention")
            ? "Review required"
            : "No flagged products",
        };
      }),
    ),
  );
}
