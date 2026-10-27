export interface Twin {
  id: string;
  kind: string;
  name: string;
  parentId: string | null;
  category: string;
  status: string;
  stage: string | null;
  revenue: number | null;
  users: number | null;
  impact: number | null;
  health: number | null;
  risk: string;
  score: number | null;
  progress: number | null;
  growth: number | null;
  forecast: {
    conservative: number;
    baseline: number;
    optimistic: number;
  } | null;
  metrics: Record<string, number>;
  source: string;
  updatedAt: string | null;
  history: { day: string; revenue: number | null; health: number | null }[];
  position: { x: number; y: number; z: number };
  dependencies: string[];
  modules: string[];
  completionHours: number | null;
}
export interface Relationship {
  id: string;
  from: string;
  to: string;
  type: string;
  source: string;
}
export interface Universe {
  access?: { role: string; canDecide: boolean };
  schemaVersion: 1;
  sampledAt: string;
  nodes: Twin[];
  relationships: Relationship[];
  summary: {
    health: number | null;
    revenue: number;
    products: number;
    divisions: number;
    projects: number;
    risks: number;
    approvals: number;
  };
  pipeline: {
    stage: string;
    queue: number;
    blocked: number;
    averageHours: number | null;
    samples: number;
    completionHours: number | null;
  }[];
  departments: {
    id: string;
    name: string;
    capacity: number | null;
    workload: number;
    backlog: number;
    health: string;
    completed: number;
    forecastHours: number | null;
  }[];
  recommendations: {
    id: string;
    productId: string;
    name: string;
    priority: string;
    reason: string;
    score: number;
  }[];
  opportunities: { entityId: string; reason: string }[];
  modules: { id: string; name: string; category: string }[];
  integrations: { id: string; status: string; detail: string }[];
  methodology: string[];
}
