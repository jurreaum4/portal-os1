import { executionCapacity } from "./execution";
import type { Env } from "./types";
import {
  analyseUniverse,
  revenueScenarios,
  topology,
  spatialScene,
  scenes,
  type TwinProduct,
  type Division,
  type GraphNode,
  type GraphEdge,
} from "../../../portal-os/universe";
import { readObject } from "./customer-auth";
import { departments } from "./operations";
const LIMIT = 5000;
const readInput = (request: Request) =>
  readObject(request).catch(() => {
    throw new SyntaxError("Expected a bounded JSON object");
  });
const json = (data: unknown, status = 200) => Response.json(data, { status });
async function rows<T>(
  env: Env,
  sql: string,
  args: (string | number)[] = [],
): Promise<T[]> {
  const result = await env.DB.prepare(sql)
    .bind(...args)
    .all<T>();
  if (result.results.length > LIMIT)
    throw new RangeError(
      "Projection exceeds 5000 records; partition the deployment before querying this view.",
    );
  return result.results;
}
export async function readUniverse(env: Env) {
  const [products, divisions, relationships, runs] = await Promise.all([
    rows<TwinProduct>(
      env,
      `SELECT p.id,p.name,p.division_id AS divisionId,p.stage,p.status,p.score,p.revenue,
   (SELECT users FROM product_telemetry t WHERE t.product_id=p.id AND julianday(t.observed_at)>=julianday('now','-1 day') ORDER BY observed_at DESC LIMIT 1) AS users,
   (SELECT health FROM product_telemetry t WHERE t.product_id=p.id AND julianday(t.observed_at)>=julianday('now','-1 day') ORDER BY observed_at DESC LIMIT 1) AS health,
   (SELECT observed_at FROM product_telemetry t WHERE t.product_id=p.id ORDER BY observed_at DESC LIMIT 1) AS telemetryAt,
   (SELECT revenue FROM intelligence_snapshots s WHERE s.product_id=p.id AND s.day<=date('now','-7 days') ORDER BY day DESC LIMIT 1) AS previousRevenue,
   (SELECT COUNT(*) FROM factory_runs r WHERE r.product_id=p.id AND r.status='blocked') AS blockedRuns
   FROM products p ORDER BY p.id LIMIT 5001`,
    ),
    rows<Division>(
      env,
      "SELECT id,name,color FROM divisions ORDER BY name LIMIT 5001",
    ),
    rows<{ id: string; sourceId: string; targetId: string; relation: string }>(
      env,
      "SELECT id,source_id AS sourceId,target_id AS targetId,relation FROM twin_relationships WHERE retired_at IS NULL ORDER BY id LIMIT 5001",
    ),
    rows<{
      id: string;
      productId: string;
      stage: string;
      status: string;
      message: string;
    }>(
      env,
      "SELECT id,product_id AS productId,stage,status,message FROM factory_runs ORDER BY id LIMIT 5001",
    ),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const dependencyMap = new Map<string, string[]>();
  for (const r of relationships)
    if (r.relation === "depends_on") {
      const list = dependencyMap.get(r.sourceId) ?? [];
      list.push(r.targetId);
      dependencyMap.set(r.sourceId, list);
    }
  const linked = products.map((p) => {
    const deps = dependencyMap.get(p.id) ?? [];
    return {
      ...p,
      dependencies: deps,
      blockedDependencies: deps.filter((id) => {
        const target = byId.get(id);
        return (
          !target ||
          ["Archived"].includes(target.stage) ||
          target.status !== "On track" ||
          target.blockedRuns > 0 ||
          (target.health !== null && target.health < 70)
        );
      }),
    };
  });
  return {
    ...analyseUniverse(linked, divisions),
    relationships,
    runs,
    sampledAt: new Date().toISOString(),
  };
}
export type UniverseResponse = Awaited<ReturnType<typeof readUniverse>>;
export async function captureIntelligence(env: Env) {
  await env.DB.prepare(
    `INSERT INTO intelligence_snapshots(product_id,day,revenue,score,stage,status,users,telemetry_at)
 SELECT p.id,date('now'),p.revenue,p.score,p.stage,p.status,
 (SELECT users FROM product_telemetry t WHERE t.product_id=p.id AND julianday(t.observed_at)>=julianday('now','-1 day') ORDER BY observed_at DESC LIMIT 1),
 (SELECT observed_at FROM product_telemetry t WHERE t.product_id=p.id ORDER BY observed_at DESC LIMIT 1) FROM products p WHERE true
 ON CONFLICT(product_id,day) DO UPDATE SET revenue=excluded.revenue,score=excluded.score,stage=excluded.stage,status=excluded.status,users=excluded.users,telemetry_at=excluded.telemetry_at`,
  ).run();
  await env.DB.batch(
    departments.map((d) =>
      env.DB.prepare(
        `INSERT INTO department_snapshots(department,day,queued,running,blocked)
 SELECT ?,date('now'),COUNT(*),COALESCE(SUM(EXISTS(SELECT 1 FROM factory_runs r WHERE r.product_id=p.id AND r.status='running')),0),
 COALESCE(SUM(EXISTS(SELECT 1 FROM factory_runs r WHERE r.product_id=p.id AND r.status='blocked')),0) FROM products p
 WHERE ${d.id === "GOV" ? "EXISTS (SELECT 1 FROM approvals a WHERE a.product_id=p.id AND a.status='pending')" : `p.stage IN (${d.stages.map(() => "?").join(",") || "''"})`}
 ON CONFLICT(department,day) DO UPDATE SET queued=excluded.queued,running=excluded.running,blocked=excluded.blocked`,
      ).bind(d.id, ...(d.id === "GOV" ? [] : d.stages)),
    ),
  );
}
async function graph(env: Env) {
  const u = await readUniverse(env);
  const approvals = await rows<{
    id: string;
    productId: string;
    status: string;
    action: string;
  }>(
    env,
    "SELECT id,product_id AS productId,status,action FROM approvals ORDER BY id LIMIT 5001",
  );
  const nodes: GraphNode[] = [
    {
      id: "ecosystem:max",
      kind: "ecosystem",
      label: "MAX Universe",
      status: u.summary.ecosystemHealth,
    },
    ...u.divisions.map((d) => ({
      id: `division:${d.id}`,
      kind: "division",
      label: d.name,
      status: d.health,
      divisionId: d.id,
    })),
    ...u.products.map((p) => ({
      id: `product:${p.id}`,
      kind: "product",
      label: p.name,
      status: p.status,
      divisionId: p.divisionId,
    })),
    ...departments.map((d) => ({
      id: `department:${d.id}`,
      kind: "department",
      label: d.name,
      status: "Derived queue projection",
    })),
    ...u.runs.map((r) => ({
      id: `project:${r.id}`,
      kind: "project",
      label: `${r.stage} · ${r.id}`,
      status: r.status,
    })),
    ...approvals.map((a) => ({
      id: `approval:${a.id}`,
      kind: "approval",
      label: a.action,
      status: a.status,
    })),
    ...[...new Set(u.products.map((p) => p.stage))].map((stage) => ({
      id: `pipeline:${stage}`,
      kind: "pipeline",
      label: stage,
      status: "Lifecycle stage",
    })),
  ];
  const edges: GraphEdge[] = [];
  const add = (source: string, target: string, relation: string) =>
    edges.push({
      id: `${relation}:${source}:${target}`,
      source,
      target,
      relation,
    });
  for (const d of u.divisions)
    add("ecosystem:max", `division:${d.id}`, "contains");
  for (const p of u.products) {
    add(`division:${p.divisionId}`, `product:${p.id}`, "owns");
    add(`product:${p.id}`, `pipeline:${p.stage}`, "at_stage");
    for (const d of departments)
      if (d.stages.includes(p.stage))
        add(`department:${d.id}`, `product:${p.id}`, "operates");
  }
  for (const r of u.runs)
    add(`product:${r.productId}`, `project:${r.id}`, "executes");
  for (const a of approvals) {
    add(`product:${a.productId}`, `approval:${a.id}`, "requires_decision");
    if (a.status === "pending")
      add("department:GOV", `approval:${a.id}`, "reviews");
  }
  for (const r of u.relationships)
    edges.push({
      id: r.id,
      source: `product:${r.sourceId}`,
      target: `product:${r.targetId}`,
      relation: r.relation,
    });
  return { schemaVersion: 1, nodes, edges, sampledAt: u.sampledAt };
}
const validString = (v: unknown, max = 120): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
export async function universeApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  if (
    ![
      "/api/ecosystem",
      "/api/intelligence",
      "/api/intelligence/forecasts",
      "/api/marketplace/operations",
      "/api/execution-workers",
    ].includes(path) &&
    !path.startsWith("/api/twin/") &&
    !path.startsWith("/api/xr/") &&
    !/^\/api\/divisions\/[^/]+\/command-centre$/.test(path) &&
    !/^\/api\/departments\/[^/]+\/history$/.test(path)
  )
    return null;
  try {
    if (request.method === "POST") {
      if (path === "/api/twin/telemetry") {
        const b = await readInput(request);
        if (
          !validString(b.productId) ||
          !validString(b.source) ||
          typeof b.observedAt !== "string" ||
          !Number.isFinite(Date.parse(b.observedAt)) ||
          Date.parse(b.observedAt) > Date.now() + 60000 ||
          Date.parse(b.observedAt) < Date.now() - 90 * 86400000 ||
          ![b.users, b.health].some((v) => v !== undefined && v !== null) ||
          [b.users, b.health].some(
            (v) =>
              v !== undefined &&
              v !== null &&
              (!Number.isSafeInteger(v) || Number(v) < 0),
          ) ||
          (b.health !== undefined &&
            b.health !== null &&
            Number(b.health) > 100)
        )
          return json(
            {
              error:
                "Provide productId, source, an observation within 90 days, and valid users or health (0–100).",
            },
            400,
          );
        if (
          !(await env.DB.prepare("SELECT id FROM products WHERE id=?")
            .bind(b.productId)
            .first())
        )
          return json({ error: "Product not found" }, 404);
        const at = new Date(b.observedAt).toISOString();
        const prior = await env.DB.prepare(
          "SELECT users,health,source FROM product_telemetry WHERE product_id=? AND observed_at=?",
        )
          .bind(b.productId, at)
          .first<{
            users: number | null;
            health: number | null;
            source: string;
          }>();
        if (
          prior &&
          (prior.users !== (b.users ?? null) ||
            prior.health !== (b.health ?? null) ||
            prior.source !== b.source)
        )
          return json({ error: "An observation cannot be rewritten" }, 409);
        const inserted = await env.DB.prepare(
          "INSERT OR IGNORE INTO product_telemetry(product_id,observed_at,users,health,source) VALUES (?,?,?,?,?)",
        )
          .bind(b.productId, at, b.users ?? null, b.health ?? null, b.source)
          .run();
        if (!inserted.meta.changes) {
          const saved = await env.DB.prepare(
            "SELECT users,health,source FROM product_telemetry WHERE product_id=? AND observed_at=?",
          )
            .bind(b.productId, at)
            .first<{
              users: number | null;
              health: number | null;
              source: string;
            }>();
          if (
            !saved ||
            saved.users !== (b.users ?? null) ||
            saved.health !== (b.health ?? null) ||
            saved.source !== b.source
          )
            return json({ error: "An observation cannot be rewritten" }, 409);
        }
        return json(
          { accepted: true, observedAt: at },
          inserted.meta.changes ? 201 : 200,
        );
      }
      if (path === "/api/twin/relationships") {
        const b = await readInput(request);
        if (
          !validString(b.id) ||
          !validString(b.sourceId) ||
          !validString(b.targetId) ||
          !validString(b.source) ||
          !["depends_on", "integrates_with"].includes(String(b.relation)) ||
          b.sourceId === b.targetId
        )
          return json(
            {
              error:
                "Provide a unique relationship id, source, two distinct products and a supported relation.",
            },
            400,
          );
        const existing = await env.DB.prepare(
          "SELECT source_id AS sourceId,target_id AS targetId,relation,source,retired_at AS retiredAt FROM twin_relationships WHERE id=?",
        )
          .bind(b.id)
          .first<{
            sourceId: string;
            targetId: string;
            relation: string;
            source: string;
            retiredAt: string | null;
          }>();
        if (existing)
          return json(
            existing.sourceId === b.sourceId &&
              existing.targetId === b.targetId &&
              existing.relation === b.relation &&
              existing.source === b.source &&
              !existing.retiredAt
              ? { id: b.id, reused: true }
              : { error: "Relationship id is already used" },
            existing.sourceId === b.sourceId &&
              existing.targetId === b.targetId &&
              existing.relation === b.relation &&
              existing.source === b.source &&
              !existing.retiredAt
              ? 200
              : 409,
          );
        const count = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM products WHERE id IN (?,?)",
        )
          .bind(b.sourceId, b.targetId)
          .first<number>("count");
        if (count !== 2)
          return json({ error: "Both products must exist" }, 404);
        const active = await env.DB.prepare(
          "SELECT id FROM twin_relationships WHERE source_id=? AND target_id=? AND relation=? AND retired_at IS NULL",
        )
          .bind(b.sourceId, b.targetId, b.relation)
          .first();
        if (active) return json({ error: "Relationship already exists" }, 409);
        await env.DB.prepare(
          "INSERT INTO twin_relationships(id,source_id,target_id,relation,source) VALUES (?,?,?,?,?)",
        )
          .bind(b.id, b.sourceId, b.targetId, b.relation, b.source)
          .run();
        return json({ id: b.id }, 201);
      }
      const retire = path.match(
        /^\/api\/twin\/relationships\/([^/]+)\/retire$/,
      );
      if (retire) {
        const b = await readInput(request);
        if (!validString(b.reason, 1000) || b.reason.trim().length < 10)
          return json(
            { error: "Provide a retirement reason of 10–1000 characters" },
            400,
          );
        const result = await env.DB.prepare(
          "UPDATE twin_relationships SET retired_at=CURRENT_TIMESTAMP,retirement_reason=? WHERE id=? AND retired_at IS NULL",
        )
          .bind(b.reason, decodeURIComponent(retire[1]))
          .run();
        return json(
          result.meta.changes
            ? { retired: true }
            : { error: "Active relationship not found" },
          result.meta.changes ? 200 : 404,
        );
      }
      return json({ error: "Method not allowed" }, 405);
    }
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);
    if (path === "/api/execution-workers") {
      const operations = await rows<{
        id: string;
        productId: string;
        worker: string;
        attempts: number;
        status: string;
        leaseExpiresAt: number | null;
        message: string;
        updatedAt: string;
      }>(
        env,
        "SELECT id,product_id AS productId,run_id AS runId,worker,attempts,status,lease_expires_at AS leaseExpiresAt,message,updated_at AS updatedAt FROM worker_operations ORDER BY updated_at DESC LIMIT 5001",
      );
      const compensation = await rows<{
        id: string;
        productId: string;
        attempts: number;
        status: string;
        leaseExpiresAt: number;
        message: string;
      }>(
        env,
        "SELECT id,product_id AS productId,run_id AS runId,attempts,status,lease_until AS leaseExpiresAt,message,updated_at AS updatedAt FROM compensation_jobs ORDER BY updated_at DESC LIMIT 5001",
      );
      const queues = await rows<{ stage: string; count: number }>(
        env,
        "SELECT stage,COUNT(*) AS count FROM factory_runs WHERE status!='completed' AND NOT EXISTS (SELECT 1 FROM workflow_approvals w JOIN approvals a ON a.id=w.approval_id WHERE w.run_id=factory_runs.id AND a.status='pending') GROUP BY stage LIMIT 5001",
      );
      const configured = [
        { name: "Build", configured: !!env.ICVS_EXECUTOR, stage: "Build" },
        { name: "QA", configured: !!env.ICVS_EXECUTOR, stage: "QA" },
        { name: "Package", configured: !!env.ICVS_EXECUTOR, stage: "Package" },
        {
          name: "Publishing",
          configured: !!env.ICVS_PUBLISHER,
          stage: "Ready",
        },
        {
          name: "Compensation",
          configured: !!env.ICVS_COMPENSATOR,
          stage: "Archived",
        },
      ];
      const workers = configured.map((w) => {
        const ops =
          w.name === "Compensation"
            ? compensation
            : operations.filter((o) => o.worker === w.name);
        const blocked = ops.filter((o) => o.status === "blocked").length;
        const expired = ops.filter(
          (o) =>
            ["pending", "running"].includes(o.status) &&
            o.leaseExpiresAt !== null &&
            o.leaseExpiresAt < Date.now(),
        ).length;
        return {
          ...w,
          queued:
            w.name === "Compensation"
              ? compensation.filter((j) => j.status !== "completed").length
              : (queues.find((q) => q.stage === w.stage)?.count ?? 0),
          blocked,
          expiredLeases: expired,
          health: !w.configured
            ? "Not configured"
            : blocked || expired
              ? "Attention"
              : ops.length
                ? "Observed operations"
                : "No execution samples",
        };
      });
      return json({
        sampledAt: new Date().toISOString(),
        workers,
        operations,
        compensation,
        executionCapacity: executionCapacity(env.ICVS_EXECUTION_SLOTS),
        healthSource:
          "Binding configuration and persisted attempts; no external availability claim. Capacity applies to the shared Build/QA/Package/Publishing lease pool; compensation uses per-job leases.",
      });
    }
    if (path === "/api/marketplace/operations") {
      const [products, creators, currencies] = await Promise.all([
        rows(
          env,
          `SELECT p.id,p.name,m.id AS releaseId,m.type,m.slug,m.withdrawn_at AS withdrawnAt,
    (SELECT COUNT(*) FROM marketplace_downloads d WHERE d.release_id=m.id) AS downloads,
    (SELECT COUNT(*) FROM customer_library l JOIN marketplace_orders o ON o.customer_id=l.customer_id AND o.release_id=l.release_id WHERE l.release_id=m.id AND o.status='paid') AS libraries,
    (SELECT COUNT(*) FROM marketplace_orders o WHERE o.release_id=m.id AND o.status='paid') AS paidOrders,
    (SELECT ROUND(AVG(r.rating),1) FROM marketplace_reviews r WHERE r.release_id=m.id) AS rating
    FROM marketplace_releases m JOIN products p ON p.id=m.product_id ORDER BY p.name LIMIT 5001`,
        ),
        rows(
          env,
          `SELECT c.id,c.name,COUNT(m.id) AS releases,(SELECT COUNT(*) FROM marketplace_downloads d JOIN marketplace_releases r ON r.id=d.release_id WHERE r.creator_id=c.id) AS downloads FROM marketplace_creators c LEFT JOIN marketplace_releases m ON m.creator_id=c.id GROUP BY c.id ORDER BY c.name LIMIT 5001`,
        ),
        rows(
          env,
          `SELECT m.product_id AS productId,m.creator_id AS creatorId,o.currency,SUM(CASE WHEN o.status='paid' THEN o.price_minor ELSE 0 END) AS paidMinor,SUM(CASE WHEN o.status='refunded' THEN o.price_minor ELSE 0 END) AS refundedMinor FROM marketplace_orders o JOIN marketplace_releases m ON m.id=o.release_id GROUP BY m.product_id,m.creator_id,o.currency LIMIT 5001`,
        ),
      ]);
      return json({
        products,
        creators,
        currencies,
        sampledAt: new Date().toISOString(),
        source:
          "Verified order states, signed download grants and library entitlements; no customer identities exposed.",
      });
    }
    const history = path.match(/^\/api\/departments\/([^/]+)\/history$/);
    if (history) {
      const id = decodeURIComponent(history[1]);
      if (!departments.some((d) => d.id === id))
        return json({ error: "Department not found" }, 404);
      return json(
        await rows(
          env,
          "SELECT day,queued,running,blocked FROM department_snapshots WHERE department=? ORDER BY day DESC LIMIT 90",
          [id],
        ),
      );
    }
    if (
      path === "/api/twin/graph" ||
      path === "/api/twin/topology" ||
      path.startsWith("/api/xr/")
    ) {
      const g = await graph(env);
      const root = url.searchParams.get("root");
      const rawDepth = url.searchParams.get("depth") ?? "2";
      if (!/^\d$/.test(rawDepth) || Number(rawDepth) > 4)
        return json({ error: "depth must be 0–4" }, 400);
      if (root && !g.nodes.some((n) => n.id === root))
        return json({ error: "Graph root not found" }, 404);
      if (path === "/api/twin/topology" && !root)
        return json({ error: "root is required" }, 400);
      let selected = root
        ? topology(g.nodes, g.edges, root, Number(rawDepth))
        : g;
      if (path.startsWith("/api/xr/")) {
        const scene = path.slice("/api/xr/".length);
        if (!scenes.includes(scene as (typeof scenes)[number]))
          return json({ error: "XR scene not found" }, 404);
        if (scene === "quantum-xr-command-room")
          selected = topology(g.nodes, g.edges, "division:quantum-xr", 2);
        if (scene === "product-constellation") {
          const ids = new Set(
            g.nodes.filter((n) => n.kind === "product").map((n) => n.id),
          );
          selected = {
            nodes: g.nodes.filter((n) => ids.has(n.id)),
            edges: g.edges.filter(
              (e) => ids.has(e.source) && ids.has(e.target),
            ),
          };
        }
        if (scene === "pipeline-universe") {
          const ids = new Set(
            g.nodes
              .filter((n) =>
                ["product", "pipeline", "project", "approval"].includes(n.kind),
              )
              .map((n) => n.id),
          );
          selected = {
            nodes: g.nodes.filter((n) => ids.has(n.id)),
            edges: g.edges.filter(
              (e) => ids.has(e.source) && ids.has(e.target),
            ),
          };
        }
        if (scene === "department-operations") {
          const ids = new Set(
            g.nodes
              .filter((n) =>
                ["department", "product", "approval"].includes(n.kind),
              )
              .map((n) => n.id),
          );
          selected = {
            nodes: g.nodes.filter((n) => ids.has(n.id)),
            edges: g.edges.filter(
              (e) => ids.has(e.source) && ids.has(e.target),
            ),
          };
        }
        if (root) {
          if (!selected.nodes.some((n) => n.id === root))
            return json({ error: "Graph root is outside this scene" }, 404);
          selected = topology(
            selected.nodes,
            selected.edges,
            root,
            Number(rawDepth),
          );
        }
        return json({
          ...spatialScene(
            scene as (typeof scenes)[number],
            selected.nodes,
            selected.edges,
          ),
          sampledAt: g.sampledAt,
        });
      }
      return json({ ...selected, schemaVersion: 1, sampledAt: g.sampledAt });
    }
    const twin = path.match(/^\/api\/twin\/products\/([^/]+)$/);
    if (twin) {
      const id = decodeURIComponent(twin[1]),
        u = await readUniverse(env),
        product = u.products.find((p) => p.id === id);
      if (!product) return json({ error: "Product not found" }, 404);
      const [history, audit] = await Promise.all([
        rows(
          env,
          "SELECT day,revenue,score,stage,status,users,telemetry_at AS telemetryAt FROM intelligence_snapshots WHERE product_id=? ORDER BY day DESC LIMIT 90",
          [id],
        ),
        rows(
          env,
          "SELECT id,sequence,from_stage AS fromStage,to_stage AS toStage,engine,actor,reason,created_at AS createdAt FROM workflow_events WHERE product_id=? ORDER BY created_at DESC,sequence DESC LIMIT 5001",
          [id],
        ),
      ]);
      return json({
        product,
        history,
        audit,
        runs: u.runs.filter((r) => r.productId === id),
        relationships: u.relationships.filter(
          (r) => r.sourceId === id || r.targetId === id,
        ),
        sampledAt: u.sampledAt,
      });
    }
    if (path === "/api/intelligence/forecasts") {
      const months = Number(url.searchParams.get("months") ?? "3"),
        growth = Number(url.searchParams.get("growth") ?? "0");
      if (
        ![3, 6, 12].includes(months) ||
        !Number.isFinite(growth) ||
        growth < -20 ||
        growth > 30
      )
        return json(
          {
            error:
              "months must be 3, 6 or 12; growth must be between -20 and 30",
          },
          400,
        );
      return json(revenueScenarios(await readUniverse(env), months, growth));
    }
    if (path === "/api/ecosystem" || path === "/api/intelligence")
      return json(await readUniverse(env));
    const division = path.match(/^\/api\/divisions\/([^/]+)\/command-centre$/);
    if (division) {
      const id = decodeURIComponent(division[1]),
        u = await readUniverse(env),
        d = u.divisions.find((d) => d.id === id);
      if (!d) return json({ error: "Division not found" }, 404);
      const products = u.products.filter((p) => p.divisionId === id);
      const ids = new Set(products.map((p) => p.id));
      return json({
        division: d,
        products,
        dependencies: u.relationships.filter(
          (r) => ids.has(r.sourceId) || ids.has(r.targetId),
        ),
        sampledAt: u.sampledAt,
      });
    }
    return json({ error: "Universe route not found" }, 404);
  } catch (e) {
    if (e instanceof RangeError) return json({ error: e.message }, 413);
    if (e instanceof SyntaxError || e instanceof URIError)
      return json({ error: "Invalid request" }, 400);
    throw e;
  }
}
