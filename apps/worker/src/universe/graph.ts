import type { Env } from "../types";
import { operationalApi, revenueScenarios } from "../operations";
import type { Twin, Relationship, Universe } from "./model";

export async function universe(env: Env): Promise<Universe> {
  const db = env.DB;
  const [
    divisions,
    products,
    runs,
    records,
    snapshots,
    config,
    stages,
    durations,
    approvalCount,
    modules,
  ] = await Promise.all([
    db.prepare("SELECT * FROM divisions ORDER BY id").all<{
      id: string;
      name: string;
      parent_id: string | null;
      category: string;
    }>(),
    db.prepare("SELECT * FROM products ORDER BY id").all<{
      id: string;
      name: string;
      division_id: string;
      stage: string;
      revenue: number;
      score: number;
      status: string;
      updated_at: string;
    }>(),
    db.prepare("SELECT * FROM factory_runs ORDER BY id").all<{
      id: string;
      product_id: string;
      stage: string;
      status: string;
      message: string;
      updated_at: string;
    }>(),
    db
      .prepare("SELECT * FROM universe_records WHERE deleted=0 ORDER BY id")
      .all<{
        id: string;
        kind: string;
        data: string;
        source: string;
        updated_at: string;
      }>(),
    db
      .prepare(
        "SELECT * FROM universe_snapshots WHERE day>=date('now','-30 days') ORDER BY day",
      )
      .all<{ day: string; entity_id: string; data: string }>(),
    db.prepare("SELECT * FROM department_config ORDER BY rowid").all<{
      id: string;
      name: string;
      capacity: number | null;
      stages: string;
    }>(),
    db
      .prepare("SELECT id FROM lifecycle_stages ORDER BY position")
      .all<{ id: string }>(),
    db
      .prepare(
        `WITH changes AS (SELECT run_id,from_stage,to_stage,created_at,
      LAG(created_at) OVER (PARTITION BY run_id ORDER BY sequence) AS previous_at FROM workflow_events WHERE from_stage IS NULL OR from_stage!=to_stage)
      SELECT from_stage AS stage,COUNT(*) AS samples,AVG((julianday(created_at)-julianday(previous_at))*24) AS hours
      FROM changes WHERE previous_at IS NOT NULL GROUP BY from_stage`,
      )
      .all<{ stage: string; samples: number; hours: number }>(),
    db
      .prepare("SELECT COUNT(*) AS count FROM approvals WHERE status='pending'")
      .first<number>("count"),
    db
      .prepare("SELECT * FROM universe_modules ORDER BY rowid")
      .all<{ id: string; name: string; category: string }>(),
  ]);
  const nodes: Twin[] = [];
  const relationships: Relationship[] = [];
  const add = (
    id: string,
    kind: string,
    name: string,
    parentId: string | null,
    extra: Partial<Twin> = {},
  ) => {
    const n: Twin = {
      id,
      kind,
      name,
      parentId,
      category: "general",
      status: "Unknown",
      stage: null,
      revenue: null,
      users: null,
      impact: null,
      health: null,
      risk: "Unknown",
      score: null,
      progress: null,
      growth: null,
      forecast: null,
      metrics: {},
      source: "Portal D1",
      updatedAt: null,
      history: [],
      position: { x: 0, y: 0, z: 0 },
      dependencies: [],
      modules: [],
      completionHours: null,
      ...extra,
    };
    nodes.push(n);
    if (parentId)
      relationships.push({
        id: `contains:${id}`,
        from: parentId,
        to: id,
        type: "contains",
        source: "Portal D1",
      });
    return n;
  };
  add("ecosystem:max", "ecosystem", "MAX Universe", null);
  for (const d of divisions.results)
    add(
      `division:${d.id}`,
      "division",
      d.name,
      d.parent_id ? `division:${d.parent_id}` : "ecosystem:max",
      { category: d.category },
    );
  for (const p of products.results)
    add(`product:${p.id}`, "product", p.name, `division:${p.division_id}`, {
      stage: p.stage,
      revenue: p.revenue,
      score: p.score,
      status: p.status,
      health: p.status === "On track" ? 100 : p.status === "Paused" ? null : 0,
      risk:
        p.status === "Attention"
          ? "High"
          : p.status === "Paused"
            ? "Unknown"
            : "Low",
      updatedAt: p.updated_at,
    });
  for (const r of runs.results)
    add(
      `project:${r.id}`,
      "project",
      `${products.results.find((p) => p.id === r.product_id)?.name ?? r.product_id} · project`,
      `product:${r.product_id}`,
      {
        stage: r.stage,
        status: r.status,
        risk: r.status === "blocked" ? "High" : "Low",
        updatedAt: r.updated_at,
        source: `Factory run: ${r.message}`,
      },
    );
  for (const d of config.results)
    add(`department:${d.id}`, "department", d.name, "ecosystem:max", {
      metrics: d.capacity === null ? {} : { capacity: d.capacity },
    });
  for (const r of records.results.filter((r) => r.kind === "entity")) {
    const data = JSON.parse(r.data);
    add(r.id, data.kind, data.name, data.parentId ?? "ecosystem:max", {
      category: data.category ?? "general",
      status: data.status ?? "Unknown",
      source: r.source,
      updatedAt: r.updated_at,
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes)
    if (n.parentId && !byId.has(n.parentId)) {
      const edge = relationships.find((r) => r.id === `contains:${n.id}`);
      n.parentId = "ecosystem:max";
      n.status = "Parent unavailable";
      n.risk = "High";
      if (edge) {
        edge.from = "ecosystem:max";
        edge.source = "Unresolved original parent; retained entity";
      }
    }
  // Latest observed timestamp wins; late-arriving observations cannot overwrite current state.
  const observations = records.results
    .filter((r) => r.kind === "observation")
    .map((r) => ({ ...r, value: JSON.parse(r.data) }))
    .sort(
      (a, b) =>
        Date.parse(a.value.observedAt) - Date.parse(b.value.observedAt) ||
        a.id.localeCompare(b.id),
    );
  for (const r of observations) {
    const n = byId.get(r.value.entityId);
    if (!n) continue;
    Object.assign(n.metrics, r.value.metrics);
    if (r.value.moduleId && !n.modules.includes(r.value.moduleId))
      n.modules.push(r.value.moduleId);
    n.source = r.source;
    n.updatedAt = r.value.observedAt;
    for (const key of ["users", "impact", "health"] as const)
      if (r.value.metrics[key] !== undefined) n[key] = r.value.metrics[key];
    if (r.value.metrics.health !== undefined) {
      n.risk =
        r.value.metrics.health < 50
          ? "High"
          : r.value.metrics.health < 80
            ? "Medium"
            : "Low";
    }
    // Product revenue remains authoritative in products; marketplace sales are a separate flow.
    if (n.kind !== "product" && r.value.metrics.revenue !== undefined)
      n.revenue = r.value.metrics.revenue;
  }
  for (const r of records.results.filter((r) => r.kind === "relationship")) {
    const value = JSON.parse(r.data);
    if (byId.has(value.from) && byId.has(value.to))
      relationships.push({ id: r.id, ...value, source: r.source });
  }
  for (const n of nodes) {
    n.dependencies = relationships
      .filter((r) => r.from === n.id && r.type === "depends_on")
      .map((r) => r.to);
    if (n.dependencies.some((id) => byId.get(id)?.risk === "High"))
      n.risk = "High";
    n.history = snapshots.results
      .filter((s) => s.entity_id === n.id)
      .map((s) => ({ day: s.day, ...JSON.parse(s.data) }));
  }
  let riskChanged = true;
  while (riskChanged) {
    riskChanged = false;
    for (const n of nodes)
      if (
        n.risk !== "High" &&
        n.dependencies.some((id) => byId.get(id)?.risk === "High")
      ) {
        n.risk = "High";
        riskChanged = true;
      }
  }
  const descendants = (id: string) => {
    const found = new Set<string>();
    const queue = [id];
    while (queue.length) {
      const parent = queue.shift()!;
      for (const n of nodes)
        if (n.parentId === parent && !found.has(n.id)) {
          found.add(n.id);
          queue.push(n.id);
        }
    }
    return nodes.filter((n) => found.has(n.id));
  };
  for (const n of nodes.filter((n) =>
    ["division", "ecosystem"].includes(n.kind),
  )) {
    const children = descendants(n.id).filter((n) => n.kind === "product");
    n.revenue = children.reduce((sum, p) => sum + (p.revenue ?? 0), 0);
    const known = children.filter((p) => p.health !== null);
    n.health = known.length
      ? known.reduce((sum, p) => sum + p.health!, 0) / known.length
      : null;
    n.risk = children.some((p) => p.risk === "High")
      ? "High"
      : children.length
        ? "Low"
        : "Unknown";
    n.status = children.length
      ? n.risk === "High"
        ? "Attention"
        : "On track"
      : "No observations";
  }
  const active = await db
    .prepare("SELECT definition FROM workflow_definitions WHERE active=1")
    .first<string>("definition");
  const workflowSteps: { stage: string }[] = active
    ? JSON.parse(active).steps
    : [];
  for (const n of nodes) {
    const index = workflowSteps.findIndex((s) => s.stage === n.stage);
    if (index >= 0)
      n.progress = Math.round(
        (100 * index) / Math.max(1, workflowSteps.length - 1),
      );
    if (n.revenue !== null) n.forecast = revenueScenarios(n.revenue);
    const previous = n.history.at(-1)?.revenue;
    if (n.revenue !== null && previous != null && previous > 0)
      n.growth = (n.revenue / previous - 1) * 100;
  }
  // Reuse v2 intelligence, including its disclosed revenue scenario assumptions.
  const read = async (path: string) =>
    (await operationalApi(
      new Request(`https://portal.internal${path}`),
      env,
    ))!.json();
  const [recommendations, forecasts] = (await Promise.all([
    read("/api/recommendations"),
    read("/api/forecasts"),
  ])) as [
    Universe["recommendations"],
    {
      divisions: {
        id: string;
        conservative: number;
        baseline: number;
        optimistic: number;
      }[];
    },
  ];
  for (const f of forecasts.divisions) {
    const n = byId.get(`division:${f.id}`);
    if (n)
      n.forecast = {
        conservative: f.conservative,
        baseline: f.baseline,
        optimistic: f.optimistic,
      };
  }
  const pipeline = stages.results.map(({ id }) => {
    const queued = products.results.filter((p) => p.stage === id);
    const sample = durations.results.find((d) => d.stage === id);
    return {
      stage: id,
      queue: queued.length,
      blocked: queued.filter((p) => p.status === "Attention").length,
      averageHours: sample && sample.samples >= 3 ? sample.hours : null,
      samples: sample?.samples ?? 0,
      completionHours:
        sample && sample.samples >= 3 ? queued.length * sample.hours : null,
    };
  });
  for (const n of nodes.filter(
    (n) => n.kind === "project" && n.status !== "blocked",
  )) {
    const index = workflowSteps.findIndex((s) => s.stage === n.stage);
    if (index >= 0) {
      const remaining = workflowSteps
        .slice(index, -1)
        .map((s) => pipeline.find((p) => p.stage === s.stage));
      if (
        remaining.length &&
        remaining.every((p) => p && p.averageHours !== null)
      )
        n.completionHours = remaining.reduce(
          (sum, p) => sum + p!.averageHours!,
          0,
        );
      if (n.status === "completed") n.completionHours = 0;
    }
  }
  const departments = config.results.map((d) => {
    const assigned: string[] = JSON.parse(d.stages);
    const queued = products.results.filter((p) => assigned.includes(p.stage));
    const capacity =
      byId.get(`department:${d.id}`)?.metrics.capacity ?? d.capacity;
    const samples = pipeline.filter(
      (p) => assigned.includes(p.stage) && p.queue > 0,
    );
    const n = byId.get(`department:${d.id}`)!;
    n.status = queued.some((p) => p.status === "Attention")
      ? "Attention"
      : queued.length
        ? "On track"
        : "Idle";
    n.metrics.workload = queued.length;
    n.health = queued.length
      ? (100 * queued.filter((p) => p.status === "On track").length) /
        queued.length
      : null;
    return {
      id: d.id,
      name: d.name,
      capacity,
      workload: queued.length,
      backlog:
        capacity === null
          ? queued.length
          : Math.max(0, queued.length - capacity),
      health: n.status,
      completed: runs.results.filter(
        (r) => r.status === "completed" && assigned.includes(r.stage),
      ).length,
      forecastHours:
        capacity &&
        samples.length &&
        samples.every((p) => p.completionHours !== null)
          ? samples.reduce((s, p) => s + p.completionHours!, 0) / capacity
          : null,
    };
  });
  // Stable, portable coordinates. No rendering framework or platform-specific objects.
  const place = (parent: string, depth: number, seen = new Set<string>()) => {
    if (seen.has(parent)) return;
    seen.add(parent);
    const children = nodes
      .filter((n) => n.parentId === parent)
      .sort((a, b) => a.id.localeCompare(b.id));
    children.forEach((n) => {
      const peers =
        depth === 0
          ? children.filter(
              (c) => (c.kind === "department") === (n.kind === "department"),
            )
          : children;
      const slot = peers.findIndex((c) => c.id === n.id);
      const angle = (2 * Math.PI * slot) / Math.max(1, peers.length);
      const p = byId.get(parent)?.position ?? { x: 0, y: 0, z: 0 };
      const radius =
        depth === 0 ? (n.kind === "department" ? 18 : 12) : 7 / (depth + 1);
      n.position = {
        x: p.x + Math.cos(angle) * radius,
        y: depth * 2,
        z: p.z + Math.sin(angle) * radius,
      };
      place(n.id, depth + 1, seen);
    });
  };
  place("ecosystem:max", 0);
  return {
    schemaVersion: 1,
    sampledAt: new Date().toISOString(),
    nodes,
    relationships,
    summary: {
      health: byId.get("ecosystem:max")!.health,
      revenue: byId.get("ecosystem:max")!.revenue ?? 0,
      products: products.results.length,
      divisions: divisions.results.filter((d) => !d.parent_id).length,
      projects: runs.results.length,
      risks: nodes.filter((n) => n.risk === "High").length,
      approvals: approvalCount ?? 0,
    },
    pipeline,
    departments,
    recommendations,
    opportunities: nodes
      .filter(
        (n) => n.kind === "product" && (n.score ?? 0) >= 85 && n.risk === "Low",
      )
      .map((n) => ({
        entityId: n.id,
        reason:
          "High lifecycle completeness and no recorded operational flag; assess readiness.",
      })),
    modules: modules.results,
    integrations: [
      {
        id: "ICVS executor",
        status: env.ICVS_EXECUTOR ? "Configured" : "Not connected",
        detail: "Actual Build, QA and Publish evidence required",
      },
      ...["Marketplace", "Sports", "Competitive intelligence"].map((id) => ({
        id,
        status: records.results.some((r) =>
          r.source.toLowerCase().includes(id.split(" ")[0].toLowerCase()),
        )
          ? "Observations received"
          : "No observations",
        detail: "Authenticated source observations; no synthetic telemetry",
      })),
    ],
    methodology: [
      "Health is derived from recorded operational status, not a live SLA. Unknown telemetry stays null.",
      "Revenue is recorded monthly USD; marketplace sales are reported separately to avoid double counting.",
      "Forecasts reuse v2 scenarios (−5%, baseline, +10%); completion estimates require three observed stage completions.",
      "Growth compares current revenue to the last daily observation. Coordinates use deterministic right-handed Y-up layout units.",
      "Sports and competitive signals are supplied by authenticated integrations; no medical or betting predictions are inferred.",
    ],
  };
}

export async function captureUniverse(env: Env) {
  const graph = await universe(env);
  const day = graph.sampledAt.slice(0, 10);
  const statements = graph.nodes.map((n) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO universe_snapshots(day,entity_id,data) VALUES (?,?,?)",
    ).bind(day, n.id, JSON.stringify({ revenue: n.revenue, health: n.health })),
  );
  for (let i = 0; i < statements.length; i += 50)
    await env.DB.batch(statements.slice(i, i + 50));
}
