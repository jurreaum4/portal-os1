/** Portal API DTOs only. MAX-CORE remains independent of Portal and Cloudflare. */
export interface ConsoleProduct {
  id: string;
  name: string;
  description: string;
  stage: string;
  score: number;
  updatedAt: string;
  unitId: string | null;
  unit: string | null;
  workflowStage: string | null;
  factoryStage: string | null;
  status: string | null;
  health: number | null;
  revenueMinor: number | null;
  currency: string | null;
  revenuePeriod: string | null;
  forecast: string | null;
  forecastDueAt: string | null;
  source: string | null;
  observedAt: string | null;
  stale: boolean;
}
export interface ConsoleDepartment {
  department: string;
  health: number | null;
  status: string;
  queue: number | null;
  currentWork: string | null;
  kpiName: string | null;
  kpiValue: string | null;
  source: string | null;
  observedAt: string | null;
  stale: boolean;
}
export interface ConsoleSnapshot {
  observedAt: string;
  products: ConsoleProduct[];
  units: { id: string; name: string }[];
  approvals: {
    id: string;
    productId: string;
    project: string;
    action: string;
    priority: string;
    risk: string;
  }[];
  portfolioScore: number | null;
  portfolioHealth: number | null;
  healthCoverage: number;
  ecosystemHealth: number | null;
  activePipelines: number;
  revenue: {
    currency: string;
    period: string;
    minor: number;
    coverage: number;
  }[];
  pipeline: { stage: string; products: ConsoleProduct[] }[];
  unclassified: ConsoleProduct[];
  departments: ConsoleDepartment[];
  forecasts: {
    productId: string;
    name: string;
    forecast: string;
    dueAt: string | null;
    source: string | null;
    observedAt: string | null;
    stale: boolean;
  }[];
  recommendations: {
    productId: string;
    title: string;
    reason: string;
    kind: string;
  }[];
  alerts: { id: string; title: string; detail: string; href: string }[];
}
export interface SystemHealth {
  checkedAt: string;
  checks: { name: string; status: string; detail: string }[];
}
