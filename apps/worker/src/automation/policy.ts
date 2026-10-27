export const policyVersion = "icvs-v1";
export const workflowStages = [
  "Idea",
  "Discovery",
  "Specification",
  "Architecture",
  "Simulation",
  "Build",
  "QA",
  "Ready",
  "Published",
] as const;
export type WorkflowStage = (typeof workflowStages)[number];
export const stageDepartment: Record<WorkflowStage, string> = {
  Idea: "STRAT",
  Discovery: "STRAT",
  Specification: "STRAT",
  Architecture: "ARCH",
  Simulation: "DATA",
  Build: "BUILD",
  QA: "TEST",
  Ready: "OPS",
  Published: "GROWTH",
};
export interface IdeaInput {
  submissionKey: string;
  title: string;
  problem: string;
  audience: string;
  requirements: string[];
  successMetrics: { name: string; target: number; unit: string }[];
  dependencies: string[];
  platformTargets: string[];
  runtimeRequirements: string[];
  impact: number;
  confidence: number;
  effort: number;
  risk: number;
  source: string;
  unitId: string | null;
}
export type Workflow =
  import("../../../automation-contract").AutomationWorkflow;
export interface Job {
  id: string;
  product_id: string;
  generation: number;
  stage: string;
  department: string;
  status: string;
  attempt: number;
  lease_token: string | null;
  lease_until: string | null;
  worker_id: string | null;
  result: string | null;
}
export function scoreIdea(input: IdeaInput): number {
  return Math.round(
    input.impact * 0.35 +
      input.confidence * 0.3 +
      (100 - input.effort) * 0.2 +
      (100 - input.risk) * 0.15,
  );
}
export function simulation(input: IdeaInput) {
  const complexityScore = Math.min(
    100,
    Math.round(
      input.effort * 0.6 +
        Math.min(
          100,
          input.requirements.length * 5 +
            input.dependencies.length * 10 +
            input.platformTargets.length * 10,
        ) *
          0.4,
    ),
  );
  const riskScore = Math.round(
    input.risk * 0.6 + (100 - input.confidence) * 0.25 + complexityScore * 0.15,
  );
  const forecastScore = Math.round(
    input.impact * 0.4 +
      input.confidence * 0.35 +
      (100 - complexityScore) * 0.25,
  );
  const successProbability =
    Math.round(
      Math.max(
        0,
        Math.min(1, (forecastScore * 0.6 + (100 - riskScore) * 0.4) / 100),
      ) * 100,
    ) / 100;
  return {
    complexityScore,
    riskScore,
    forecastScore,
    successProbability,
    model: policyVersion,
    interpretation:
      "Heuristic planning estimate, not an empirically calibrated probability",
    inputs: {
      impact: input.impact,
      confidence: input.confidence,
      effort: input.effort,
      risk: input.risk,
      requirements: input.requirements.length,
      dependencies: input.dependencies.length,
      platformTargets: input.platformTargets.length,
    },
  };
}
export function generateArtifact(kind: string, input: IdeaInput) {
  switch (kind) {
    case "discovery":
      return {
        problem: input.problem,
        audience: input.audience,
        opportunity: input.title,
        qualificationScore: scoreIdea(input),
        source: input.source,
      };
    case "specification":
      return {
        title: input.title,
        productSpecification: input.problem,
        audience: input.audience,
        requirements: input.requirements,
        successMetrics: input.successMetrics,
        riskRating:
          input.risk >= 70 ? "High" : input.risk >= 40 ? "Medium" : "Low",
        provenance:
          "Generated from submitted requirements; no invented requirements or metrics",
      };
    case "architecture":
      return {
        architecturePackage: {
          product: input.title,
          requirements: input.requirements,
          executionBoundary:
            "Existing product workers consume leased work; Portal Worker orchestrates and D1 persists evidence",
        },
        dependencies: input.dependencies,
        runtimeRequirements: input.runtimeRequirements,
        platformTargets: input.platformTargets,
        provenance:
          "Derived from declared intake constraints; platform targets are not assumed",
      };
    case "simulation":
      return simulation(input);
    default:
      throw new Error("Unsupported artifact");
  }
}
export function promotion(input: {
  score: number;
  health: number | null;
  forecastScore: number | null;
  stage: string;
  status: string;
}) {
  if (input.status === "paused")
    return {
      classification: "Archive",
      reason:
        "Workflow is paused by a rejected governor intervention; classification does not delete data",
    };
  if (input.health !== null && input.health < 60)
    return {
      classification: "Improve",
      reason: "Fresh product health is below 60",
    };
  if (
    input.score >= 80 &&
    input.health !== null &&
    input.health >= 80 &&
    input.forecastScore !== null &&
    input.forecastScore >= 70 &&
    ["Ready", "Published"].includes(input.stage)
  )
    return {
      classification: "Promote",
      reason:
        "Score, fresh health, forecast and lifecycle thresholds are satisfied",
    };
  if (input.forecastScore !== null && input.forecastScore < 50)
    return {
      classification: "Improve",
      reason: "Planning forecast score is below 50",
    };
  return {
    classification: "Maintain",
    reason:
      "Retain current course; promotion requires sufficient score, health, forecast and lifecycle evidence",
  };
}
