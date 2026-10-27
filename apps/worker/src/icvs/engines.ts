import { Simulation } from "../../../../max-core/simulation";

export type Stage = string;
export interface Brief {
  name: string;
  description: string;
}
export interface ExecutionEvidence {
  operationId: string;
  artifact: string;
  digest: string;
  checks: { requirement: string; passed: boolean; report: string }[];
}
export function intakeEngine(brief: Brief) {
  if (brief.name.trim().length < 2 || brief.description.trim().length < 20)
    throw new Error(
      "A product name and a brief of at least 20 characters are required",
    );
  return {
    name: brief.name,
    brief: brief.description,
    source: "Submitted product brief",
  };
}
export function specificationEngine(brief: Brief) {
  // Preserve submitted scope verbatim; do not invent user requirements.
  return {
    objective: brief.description,
    requirements: [{ id: "brief", text: brief.description }],
    acceptance: [
      "Build artifact identified by SHA-256",
      "QA verifies the submitted brief against the same artifact",
    ],
  };
}
export function architectureEngine(brief: Brief) {
  return {
    objective: brief.description,
    orchestration: [
      "Existing Worker APIs",
      "ProductFactoryActor",
      "Existing D1",
    ],
    executionBoundary:
      "Executor owns product implementation and QA; ICVS owns lifecycle coordination",
    coreBoundary: "MAX-CORE remains an unchanged reusable runtime",
    deliverables: [
      "Build artifact",
      "Artifact digest",
      "Requirement-linked QA report",
    ],
  };
}
export function simulationEngine(brief: Brief, stages: string[]) {
  const simulation = new Simulation({
    initial: { index: 0, reached: [stages[0]] },
    stepMs: 1,
    reduce: (state) => ({
      index: state.index + 1,
      reached: [...state.reached, stages[state.index + 1]],
    }),
  });
  simulation.start();
  const result = simulation.update(stages.length - 1);
  return {
    method: "MAX-CORE deterministic lifecycle reachability",
    reached: result.reached,
    passed:
      result.reached.at(-1) === stages.at(-1) &&
      brief.description.trim().length >= 20,
    scope: "Workflow model only; product behavior is verified by executor QA",
  };
}
export function scoringEngine(stage: Stage, stages: string[]) {
  const index = stages.indexOf(stage);
  return {
    score:
      stage === "Archived"
        ? 0
        : Math.round((Math.max(0, index) / (stages.length - 1)) * 100),
    method:
      "Lifecycle evidence completeness v1; not a revenue or market prediction",
  };
}
export function validateEvidence(
  value: unknown,
  operationId: string,
  qa: boolean,
  build?: ExecutionEvidence,
): ExecutionEvidence {
  const e = value as ExecutionEvidence;
  if (
    !e ||
    e.operationId !== operationId ||
    typeof e.artifact !== "string" ||
    !/^https:\/\/\S{1,2000}$/.test(e.artifact) ||
    typeof e.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(e.digest) ||
    !Array.isArray(e.checks) ||
    e.checks.length > 100 ||
    e.checks.some(
      (c) =>
        !c ||
        typeof c.requirement !== "string" ||
        c.requirement.length > 200 ||
        typeof c.passed !== "boolean" ||
        typeof c.report !== "string" ||
        c.report.length > 2000,
    )
  )
    throw new Error("Executor returned invalid or uncorrelated evidence");
  if (e.checks.some((c) => !c.passed))
    throw new Error("Executor reported failed checks");
  if (
    qa &&
    (!build ||
      e.artifact !== build.artifact ||
      e.digest !== build.digest ||
      !e.checks.some(
        (c) =>
          c.requirement === "brief" &&
          c.passed &&
          /^https:\/\/\S+$/.test(c.report),
      ) ||
      e.checks.some((c) => !c.passed))
  )
    throw new Error(
      "QA must verify the build artifact and every submitted requirement",
    );
  return e;
}
export function promotionEngine(
  build?: ExecutionEvidence,
  qa?: ExecutionEvidence,
) {
  if (!build || !qa)
    throw new Error("Build and QA evidence are required for promotion");
  validateEvidence(qa, qa.operationId, true, build);
  return {
    artifact: build.artifact,
    digest: build.digest,
    qa: qa.checks,
    eligible: true,
  };
}
export function archiveEngine(reason: string) {
  return {
    reason,
    retention: "Preserve all workflow events, decisions and artifacts",
    deleted: false,
  };
}
