export interface PortfolioProduct {
  id: string;
  name: string;
  stage: string;
  status: string;
  score: number;
}
export function recommendations(products: PortfolioProduct[]) {
  return products.flatMap((p) => {
    const reason =
      p.status === "Attention"
        ? "Resolve flagged product health before advancing."
        : p.stage === "Ready"
          ? "Review release readiness and the approval queue."
          : p.score >= 85 &&
              !["Published", "Live", "Archived"].includes(p.stage)
            ? "Prioritise this high scoring opportunity in the delivery queue."
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
  });
}
export function departmentMetrics(
  queue: PortfolioProduct[],
  runs: { productId: string; status: string }[],
  capacity: number | null,
  completed7d: number,
) {
  const ids = new Set(queue.map((p) => p.id));
  const relevant = runs.filter((r) => ids.has(r.productId));
  const workload = relevant.filter((r) => r.status === "running").length;
  const blocked = relevant.filter((r) => r.status === "blocked").length;
  return {
    capacity,
    workload,
    backlog: Math.max(0, queue.length - workload),
    capacityUnit: "concurrent operations",
    forecasts: {
      daysToClear:
        completed7d > 0 ? Math.ceil((queue.length * 7) / completed7d) : null,
      method:
        "Queue size divided by observed stage exits over the last 7 days; assumes unchanged arrival and completion rates. Not a delivery commitment.",
    },
    recommendations: [
      ...(blocked
        ? [
            `Resolve ${blocked} blocked workflow${blocked === 1 ? "" : "s"} before allocating more work.`,
          ]
        : []),
      ...(capacity === null
        ? ["Configure department capacity to measure utilisation."]
        : workload > capacity
          ? ["Workload exceeds configured department capacity."]
          : []),
      ...(!completed7d && queue.length
        ? [
            "No completed stage exits in the last 7 days; a completion forecast is unavailable.",
          ]
        : []),
    ],
    completed7d,
  };
}
export function configuredCapacity(
  raw: string | undefined,
  department: string,
): number | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw)?.[department];
    return Number.isInteger(value) && value >= 0 && value <= 10000
      ? value
      : null;
  } catch {
    return null;
  }
}
