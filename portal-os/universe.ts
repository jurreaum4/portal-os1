/** Read-model intelligence. Never controls lifecycle transitions or MAX-CORE. */
export interface TwinProduct {
  id: string;
  name: string;
  divisionId: string;
  stage: string;
  status: string;
  score: number;
  revenue: number;
  users: number | null;
  health: number | null;
  telemetryAt: string | null;
  previousRevenue: number | null;
  dependencies: string[];
  blockedDependencies: string[];
  blockedRuns: number;
}
export interface Division {
  id: string;
  name: string;
  color: string;
}
export function growth(
  current: number,
  previous: number | null,
): number | null {
  return previous === null || previous <= 0
    ? null
    : Math.round(((current - previous) / previous) * 1000) / 10;
}
export function analyseProduct(p: TwinProduct) {
  const risks = [
    ...(p.status === "Attention" ? ["Product is flagged for attention."] : []),
    ...(p.status === "Paused" ? ["Product operations are paused."] : []),
    ...(p.blockedRuns
      ? [`${p.blockedRuns} workflow operation(s) blocked.`]
      : []),
    ...(p.blockedDependencies.length
      ? [
          `${p.blockedDependencies.length} dependency/dependencies unavailable or flagged.`,
        ]
      : []),
    ...(p.health !== null && p.health < 70
      ? ["Observed product health is below 70."]
      : []),
  ];
  const risk = Math.min(100, risks.length * 25);
  const observedGrowthPct = growth(p.revenue, p.previousRevenue);
  const opportunities =
    p.score >= 85 &&
    !["Published", "Live", "Archived"].includes(p.stage) &&
    !risks.length
      ? [
          "High scoring product with no current risk flags; review promotion evidence.",
        ]
      : [];
  const recommendations = risks.length
    ? risks
    : p.stage === "Ready"
      ? ["Review approved release and publishing evidence."]
      : opportunities;
  return {
    ...p,
    risk,
    risks,
    opportunities,
    recommendations,
    observedGrowthPct,
    nextBestAction: recommendations[0] ?? "Monitor operational evidence.",
    promotionCandidate: opportunities.length > 0,
    archiveCandidate: p.status === "Paused" && p.score < 40,
    forecast: {
      reportedMonthlyUsd: p.revenue,
      baselineNextMonthUsd: p.revenue,
      method:
        "Flat reported monthly revenue baseline; no unobserved growth assumed.",
      observedGrowthPct,
      confidence:
        p.previousRevenue === null
          ? "insufficient-history"
          : "descriptive-only",
    },
  };
}
export type ProductTwin = ReturnType<typeof analyseProduct>;
export function analyseUniverse(
  products: TwinProduct[],
  divisions: Division[],
) {
  const twins = products.map(analyseProduct);
  const byDivision = new Map<string, ProductTwin[]>();
  for (const p of twins) {
    const group = byDivision.get(p.divisionId) ?? [];
    group.push(p);
    byDivision.set(p.divisionId, group);
  }
  const groups = divisions.map((d) => {
    const rows = byDivision.get(d.id) ?? [];
    const revenue = rows.reduce((s, p) => s + p.revenue, 0);
    // Require matching history for every product, rather than treating missing baselines as zero.
    const previous =
      rows.length && rows.every((p) => p.previousRevenue !== null)
        ? rows.reduce((s, p) => s + p.previousRevenue!, 0)
        : null;
    return {
      ...d,
      products: rows.length,
      revenue,
      observedGrowthPct: growth(revenue, previous),
      portfolioScore: rows.length
        ? Math.round(rows.reduce((s, p) => s + p.score, 0) / rows.length)
        : null,
      health: rows.length
        ? rows.some((p) => p.risk > 0)
          ? "Attention"
          : "No current risk flags"
        : "No product data",
      risk: rows.length ? Math.max(...rows.map((p) => p.risk)) : null,
      recommendations: rows.flatMap((p) =>
        p.recommendations.map((reason) => ({
          productId: p.id,
          name: p.name,
          reason,
        })),
      ),
      forecastMonthlyUsd: revenue,
    };
  });
  const rank = (metric: (p: ProductTwin) => number | null) =>
    twins
      .filter((p) => metric(p) !== null)
      .sort((a, b) => metric(b)! - metric(a)! || a.id.localeCompare(b.id))
      .map((p, i) => ({
        id: p.id,
        name: p.name,
        value: metric(p)!,
        rank: i + 1,
      }));
  const divisionRank = (
    metric: (d: (typeof groups)[number]) => number | null,
  ) =>
    groups
      .filter((d) => metric(d) !== null)
      .sort((a, b) => metric(b)! - metric(a)! || a.id.localeCompare(b.id))
      .map((d, i) => ({
        id: d.id,
        name: d.name,
        value: metric(d)!,
        rank: i + 1,
      }));
  return {
    products: twins,
    divisions: groups,
    summary: {
      products: twins.length,
      divisions: groups.length,
      portfolioScore: twins.length
        ? Math.round(twins.reduce((s, p) => s + p.score, 0) / twins.length)
        : null,
      reportedMonthlyUsd: twins.reduce((s, p) => s + p.revenue, 0),
      riskProducts: twins.filter((p) => p.risk > 0).length,
      ecosystemHealth: !twins.length
        ? "No product data"
        : twins.some((p) => p.risk > 0)
          ? "Attention"
          : "No current risk flags",
      observedGrowthPct:
        twins.length && twins.every((p) => p.previousRevenue !== null)
          ? growth(
              twins.reduce((s, p) => s + p.revenue, 0),
              twins.reduce((s, p) => s + p.previousRevenue!, 0),
            )
          : null,
    },
    rankings: {
      product: rank((p) => p.score),
      revenue: rank((p) => p.revenue),
      growth: rank((p) => p.observedGrowthPct),
      risk: rank((p) => p.risk),
      health: rank((p) => p.health),
      division: divisionRank((d) => d.portfolioScore),
      divisionRevenue: divisionRank((d) => d.revenue),
      divisionGrowth: divisionRank((d) => d.observedGrowthPct),
    },
    alerts: twins.flatMap((p) =>
      p.risks.map((reason) => ({ productId: p.id, name: p.name, reason })),
    ),
    nextBestAction:
      [...twins]
        .filter((p) => p.risk > 0)
        .sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id))[0]
        ?.nextBestAction ??
      [...twins]
        .filter((p) => p.promotionCandidate)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0]
        ?.nextBestAction ??
      "Monitor operational evidence.",
    methods: {
      growth:
        "Reported monthly revenue compared with the latest stored daily snapshot at least 7 days old. Missing or zero baselines yield no percentage.",
      risk: "25 points per observed risk flag, capped at 100; a triage heuristic, not a probability.",
      health:
        "Observed product telemetry only; unknown health is excluded from health rankings.",
      forecast:
        "Flat baseline of reported monthly USD revenue, separate from settled marketplace payments.",
    },
  };
}
export type Universe = ReturnType<typeof analyseUniverse>;
export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  status: string;
  divisionId?: string;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}
export const scenes = [
  "ecosystem-galaxy",
  "product-constellation",
  "pipeline-universe",
  "department-operations",
  "quantum-xr-command-room",
] as const;
export function topology(
  nodes: GraphNode[],
  edges: GraphEdge[],
  root: string,
  depth: number,
) {
  const selected = new Set([root]);
  let frontier = new Set([root]);
  for (let i = 0; i < depth; i++) {
    const next = new Set<string>();
    for (const e of edges)
      if (frontier.has(e.source) || frontier.has(e.target)) {
        if (!selected.has(e.source)) next.add(e.source);
        if (!selected.has(e.target)) next.add(e.target);
      }
    for (const id of next) selected.add(id);
    frontier = next;
  }
  return {
    nodes: nodes.filter((n) => selected.has(n.id)),
    edges: edges.filter(
      (e) => selected.has(e.source) && selected.has(e.target),
    ),
  };
}
export function spatialScene(
  scene: (typeof scenes)[number],
  nodes: GraphNode[],
  edges: GraphEdge[],
) {
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const positions = sorted.map((n, i) => ({
    ...n,
    position: {
      x: Math.round(Math.cos(i * 2.399963) * Math.sqrt(i + 1) * 4 * 100) / 100,
      y: Math.round(Math.sin(i * 2.399963) * Math.sqrt(i + 1) * 4 * 100) / 100,
      z: 0,
    },
  }));
  return {
    schemaVersion: 1,
    scene,
    coordinateSystem: {
      handedness: "right",
      up: "y",
      units: "metres",
      layout: "deterministic illustrative layout; no physical-location claim",
    },
    nodes: positions,
    edges,
  };
}

/** Explicit what-if scenarios; these are not learned predictions. */
export function revenueScenarios(
  universe: Universe,
  months: number,
  monthlyGrowthPct: number,
) {
  const factor = (pct: number) => (1 + pct / 100) ** months;
  return {
    months,
    monthlyGrowthPct,
    method:
      "Reported monthly USD × compound monthly growth assumption. This is a scenario, not a prediction.",
    divisions: universe.divisions.map((d) => ({
      id: d.id,
      name: d.name,
      current: d.revenue,
      conservative: d.revenue * factor(-5),
      scenario: d.revenue * factor(monthlyGrowthPct),
      optimistic: d.revenue * factor(10),
    })),
    totals: {
      current: universe.summary.reportedMonthlyUsd,
      scenario: universe.summary.reportedMonthlyUsd * factor(monthlyGrowthPct),
    },
    observedGrowthPct: universe.summary.observedGrowthPct,
  };
}
