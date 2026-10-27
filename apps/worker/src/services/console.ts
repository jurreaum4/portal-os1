import type { ConsoleSnapshot, SystemHealth } from "../../../console-contract";
import type { Env } from "../types";

export const factoryStages = [
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
] as const;
const departments = [
  "GOV",
  "STRAT",
  "ARCH",
  "BUILD",
  "TEST",
  "OPS",
  "DATA",
  "GROWTH",
] as const;
export interface PortfolioRow {
  id: string;
  name: string;
  description: string;
  stage: string;
  score: number;
  updatedAt: string;
  unitId: string | null;
  unit: string | null;
  workflowStage: string | null;
  status: string | null;
  health: number | null;
  revenueMinor: number | null;
  currency: string | null;
  revenuePeriod: string | null;
  forecast: string | null;
  forecastDueAt: string | null;
  source: string | null;
  observedAt: string | null;
}
export const portfolioQuery = `SELECT p.id, p.name, p.description, p.stage, p.score, p.updated_at AS updatedAt,
 p.unit_id AS unitId, u.name AS unit, o.workflow_stage AS workflowStage, o.status, o.health,
 o.revenue_minor AS revenueMinor, o.currency, o.revenue_period AS revenuePeriod,
 o.forecast, o.forecast_due_at AS forecastDueAt, o.source, o.observed_at AS observedAt
 FROM products p LEFT JOIN portfolio_units u ON u.id=p.unit_id
 LEFT JOIN product_observations o ON o.product_id=p.id`;

// Never infer Discovery from legacy Validation: that state does not establish a precise factory step.
export function effectiveStage(product: PortfolioRow): string | null {
  return (
    product.workflowStage ??
    (
      {
        Idea: "Idea",
        Build: "Build",
        Ready: "Ready",
        Live: "Published",
      } as Record<string, string>
    )[product.stage] ??
    null
  );
}
function stale(timestamp: string | null): boolean {
  const time = timestamp ? Date.parse(timestamp) : NaN;
  return (
    !Number.isFinite(time) || time > Date.now() || Date.now() - time > 86400000
  );
}
export async function consoleSnapshot(
  db: D1Database,
): Promise<ConsoleSnapshot> {
  const [
    productResult,
    unitsResult,
    approvalResult,
    processResult,
    departmentResult,
  ] = await db.batch([
    db.prepare(`${portfolioQuery} ORDER BY p.score DESC,p.name`),
    db.prepare("SELECT id,name FROM portfolio_units ORDER BY name"),
    db.prepare(
      "SELECT a.id,a.product_id AS productId,p.name AS project,a.action,a.priority,a.risk FROM approvals a JOIN products p ON p.id=a.product_id WHERE a.status='pending' ORDER BY CASE a.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END,a.created_at,a.id",
    ),
    db.prepare(
      "SELECT state,COUNT(*) AS count FROM virtual_processes GROUP BY state",
    ),
    db.prepare(
      "SELECT department,health,status,queue,current_work AS currentWork,kpi_name AS kpiName,kpi_value AS kpiValue,source,observed_at AS observedAt FROM department_observations",
    ),
  ]);
  const products = (productResult.results as unknown as PortfolioRow[]).map(
    (p) => ({
      ...p,
      factoryStage: effectiveStage(p),
      stale: stale(p.observedAt),
    }),
  );
  const approvals = approvalResult.results as unknown as {
    id: string;
    productId: string;
    project: string;
    action: string;
    priority: string;
    risk: string;
  }[];
  const processes = processResult.results as unknown as {
    state: string;
    count: number;
  }[];
  const observations = departmentResult.results as unknown as {
    department: string;
    health: number | null;
    status: string;
    queue: number | null;
    currentWork: string | null;
    kpiName: string | null;
    kpiValue: string | null;
    source: string;
    observedAt: string;
  }[];
  const count = (state: string) =>
    processes.find((p) => p.state === state)?.count ?? 0;
  const processTotal = processes.reduce((sum, p) => sum + p.count, 0);
  const sampled = products.filter((p) => p.health !== null && !p.stale);
  const recommendations = products.flatMap((p) => {
    if (p.workflowStage && p.stale) return [];
    if (p.status === "blocked" && !p.stale)
      return [
        {
          productId: p.id,
          title: `Resolve ${p.name}'s blocker`,
          reason: "Latest workflow observation reports blocked work.",
          kind: "attention",
        },
      ];
    if (p.factoryStage === "Ready")
      return [
        {
          productId: p.id,
          title: `Review ${p.name} for publication`,
          reason:
            "Product is at Ready; governor approval does not execute publication.",
          kind: "opportunity",
        },
      ];
    if (p.score >= 80 && p.factoryStage === "Idea")
      return [
        {
          productId: p.id,
          title: `Explore ${p.name}`,
          reason: "Idea with a recorded portfolio score of at least 80/100.",
          kind: "opportunity",
        },
      ];
    return [];
  });
  const revenue = [
    ...new Set(
      products
        .filter((p) => p.revenueMinor !== null && !p.stale)
        .map((p) => `${p.currency}|${p.revenuePeriod}`),
    ),
  ].map((key) => {
    const rows = products.filter(
      (p) =>
        `${p.currency}|${p.revenuePeriod}` === key &&
        p.revenueMinor !== null &&
        !p.stale,
    );
    return {
      currency: rows[0].currency!,
      period: rows[0].revenuePeriod!,
      minor: rows.reduce((sum, p) => sum + p.revenueMinor!, 0),
      coverage: rows.length,
    };
  });
  return {
    observedAt: new Date().toISOString(),
    products,
    units: unitsResult.results as unknown as { id: string; name: string }[],
    approvals,
    portfolioScore: products.length
      ? Math.round(
          products.reduce((sum, p) => sum + p.score, 0) / products.length,
        )
      : null,
    portfolioHealth: sampled.length
      ? Math.round(
          sampled.reduce((sum, p) => sum + p.health!, 0) / sampled.length,
        )
      : null,
    healthCoverage: sampled.length,
    revenue,
    ecosystemHealth: processTotal
      ? Math.round(
          (100 * (count("READY") + count("RUNNING") + count("SUSPENDED"))) /
            processTotal,
        )
      : null,
    activePipelines: products.filter(
      (p) => p.factoryStage && !["Published"].includes(p.factoryStage),
    ).length,
    pipeline: factoryStages.map((stage) => ({
      stage,
      products: products.filter((p) => p.factoryStage === stage),
    })),
    unclassified: products.filter((p) => !p.factoryStage),
    departments: departments.map((department) => {
      const row = observations.find((o) => o.department === department);
      return {
        department,
        health: row?.health ?? null,
        status: row?.status ?? "Not reported",
        queue: row?.queue ?? (department === "GOV" ? approvals.length : null),
        currentWork: row?.currentWork ?? null,
        kpiName: row?.kpiName ?? null,
        kpiValue: row?.kpiValue ?? null,
        source: row?.source ?? (department === "GOV" ? "Approval queue" : null),
        observedAt: row?.observedAt ?? null,
        stale: row ? stale(row.observedAt) : true,
      };
    }),
    forecasts: products
      .filter((p) => p.forecast)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        forecast: p.forecast!,
        dueAt: p.forecastDueAt,
        source: p.source,
        observedAt: p.observedAt,
        stale: p.stale,
      })),
    recommendations,
    alerts: [
      ...approvals
        .filter((a) => a.risk === "High")
        .map((a) => ({
          id: `approval-${a.id}`,
          title: `High-risk decision: ${a.project}`,
          detail: a.action,
          href: `/approvals?product=${encodeURIComponent(a.productId)}`,
        })),
      ...(count("PANICKED")
        ? [
            {
              id: "runtime-panic",
              title: `${count("PANICKED")} panicked processes`,
              detail: "Stored runtime states need investigation.",
              href: "/runtime",
            },
          ]
        : []),
      ...products
        .filter((p) => !p.stale && p.health !== null && p.health < 50)
        .map((p) => ({
          id: `health-${p.id}`,
          title: `Low health: ${p.name}`,
          detail: `Reported health ${p.health}/100.`,
          href: `/products/${encodeURIComponent(p.id)}`,
        })),
    ],
  };
}
export async function systemHealth(env: Env): Promise<SystemHealth> {
  const checkedAt = new Date().toISOString();
  let database = "unavailable";
  let runtime = "unknown";
  let detail = "No process observations";
  try {
    if (env.DB) {
      await env.DB.prepare("SELECT 1").first();
      database = "healthy";
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(state='PANICKED'),0) AS panicked FROM virtual_processes",
      ).first<{ total: number; panicked: number }>();
      if (row?.total) {
        runtime = row.panicked ? "degraded" : "observed";
        detail = `${row.total} stored processes; ${row.panicked} panicked. Not a heartbeat check.`;
      }
    }
  } catch {
    database = "unavailable";
  }
  let actor = "unavailable";
  try {
    if (env.MICROKERNEL_ACTOR) {
      const stub = env.MICROKERNEL_ACTOR.get(
        env.MICROKERNEL_ACTOR.idFromName("kernel_root"),
      );
      const response = await stub.fetch("https://kernel/health", {
        signal: AbortSignal.timeout(3000),
      });
      actor = response.ok ? "healthy" : "unavailable";
    }
  } catch {
    actor = "unavailable";
  }
  return {
    checkedAt,
    checks: [
      { name: "API", status: "healthy", detail: "Worker handled this request" },
      { name: "D1", status: database, detail: "Live database read probe" },
      {
        name: "Durable Object",
        status: actor,
        detail: "Live kernel_root actor probe",
      },
      { name: "Runtime", status: runtime, detail },
      {
        name: "Queue",
        status: "unknown",
        detail: "No queue binding or queue telemetry is configured",
      },
    ],
  };
}
