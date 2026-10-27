export type Stage =
  | "Idea"
  | "Discovery"
  | "Specification"
  | "Architecture"
  | "Simulation"
  | "Build"
  | "QA"
  | "Test"
  | "Package"
  | "Ready"
  | "Published"
  | "Validation"
  | "Live"
  | "Archived";
export interface Product {
  id: string;
  name: string;
  description: string;
  stage: Stage;
  score: number;
  updatedAt: string;
  divisionId: string;
  revenue: number;
  status: "On track" | "Attention" | "Paused";
}
export interface Approval {
  id: string;
  productId: string;
  project: string;
  action: string;
  priority: "High" | "Medium" | "Low";
  risk: "High" | "Medium" | "Low";
  status: "pending";
}
export interface DashboardMetrics {
  projects: number;
  activeProducts: number;
  readyToPublish: number;
  approvals: number;
  health: number | null;
}
export interface PipelineColumn {
  stage: Stage;
  products: Product[];
}
export interface StageMetric {
  stage: Stage;
  count: number;
  averageScore: number;
}
export interface ProcessMetric {
  state: string;
  count: number;
}
export interface GovernanceMetric {
  status: string;
  count: number;
}

export interface Division {
  id: string;
  name: string;
  color: string;
}
export interface SystemHealth {
  status: string;
  sampledAt: string;
  services: { name: string; status: string; detail: string }[];
}
export interface Activity {
  id: string;
  productId: string | null;
  title: string;
  department: string;
  kind: string;
  createdAt: string;
}
export interface Recommendation {
  id: string;
  productId: string;
  name: string;
  priority: string;
  reason: string;
  score: number;
}
export interface Department {
  id: string;
  name: string;
  description: string;
  status: string;
  health: string;
  queue: Product[];
  outputs: { id: string; title: string; createdAt: string }[];
  kpis: {
    queued: number;
    averageScore: number | null;
    pendingApprovals: number | null;
  };
}
export interface FactoryRun {
  id: string;
  productId: string;
  name: string;
  status: string;
  stage: string;
  message: string;
  updatedAt: string;
}
export interface FactoryOutput {
  id: string;
  engine: string;
  content: string;
  createdAt: string;
}
export interface Forecast {
  method: string;
  divisions: {
    id: string;
    name: string;
    revenue: number;
    products: number;
    ready: number;
    conservative: number;
    baseline: number;
    optimistic: number;
  }[];
}
export const STAGES: Stage[] = [
  "Idea",
  "Discovery",
  "Specification",
  "Architecture",
  "Simulation",
  "Build",
  "QA",
  "Test",
  "Package",
  "Ready",
  "Published",
  "Validation",
  "Live",
  "Archived",
];
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export interface Deployment {
  id: string;
  name: string;
  environment: string;
  status: string;
  createdAt: string;
}

export interface WorkflowTransition {
  id: string;
  runId: string;
  sequence: number;
  fromStage: string | null;
  toStage: string;
  engine: string;
  actor: string;
  reason: string;
  evidence: string;
  createdAt: string;
}
