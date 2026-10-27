/** Additive Portal automation API DTOs; no dependency on MAX-CORE or Worker bindings. */
export type WorkflowStage =
  | "Idea"
  | "Discovery"
  | "Specification"
  | "Architecture"
  | "Simulation"
  | "Build"
  | "QA"
  | "Ready"
  | "Published";
export interface AutomationWorkflow {
  product_id: string;
  idea_id: string;
  stage: WorkflowStage;
  status: "active" | "awaiting_governor" | "paused" | "complete";
  generation: number;
  version: number;
  last_operation: string;
  reason: string;
  updated_at: string;
}
export interface AutomationResource {
  department: string;
  capacity: number;
  workload: number;
  backlog: number;
  failed: number;
}
export interface AutomationEvent {
  id: number;
  product_id: string | null;
  entity_id: string;
  kind: string;
  action: string;
  from_state: string | null;
  to_state: string | null;
  details: string;
  occurred_at: string;
}
export interface SimulationResult {
  complexityScore: number;
  riskScore: number;
  forecastScore: number;
  successProbability: number;
  model: string;
  interpretation: string;
  inputs: Record<string, number>;
}
export interface AutomationSummary {
  policyVersion: string;
  ideas: { state: string; count: number }[];
  workflows: (AutomationWorkflow & { name: string })[];
  resources: AutomationResource[];
  simulations: {
    product_id: string;
    name: string;
    content: SimulationResult;
    created_at: string;
  }[];
  promotions: {
    product_id: string;
    name: string;
    classification: string;
    nextAction: string;
    opportunity: string | null;
    risk: string | null;
    reason: string;
    inputs: string;
    policy_version: string;
    updated_at: string;
  }[];
  events: AutomationEvent[];
}
export interface AutomationProject {
  workflow: AutomationWorkflow;
  artifacts: {
    id: string;
    product_id: string;
    generation: number;
    kind: string;
    content: unknown;
    policy_version: string;
    created_at: string;
  }[];
  jobs: {
    id: string;
    product_id: string;
    generation: number;
    stage: string;
    department: string;
    status: string;
    attempt: number;
    worker_id: string | null;
    lease_until: string | null;
    result: string | null;
    created_at: string;
    updated_at: string;
  }[];
  events: AutomationEvent[];
}
