export interface WorkflowDefinition {
  id: string;
  steps: { stage: string; engine: string }[];
}
export async function loadDefinition(
  db: D1Database,
  legacy = false,
): Promise<WorkflowDefinition> {
  const row = await db
    .prepare(
      legacy
        ? "SELECT definition FROM workflow_definitions WHERE id='icvs-v2'"
        : "SELECT definition FROM workflow_definitions WHERE active=1",
    )
    .first<{ definition: string }>();
  if (!row) throw new Error("Workflow definition unavailable");
  const definition = JSON.parse(row.definition) as WorkflowDefinition;
  const engines = new Set([
    "intake",
    "discovery",
    "research",
    "specification",
    "architecture",
    "simulation",
    "build",
    "qa",
    "ready",
    "publish",
  ]);
  const steps = definition.steps;
  if (
    !Array.isArray(steps) ||
    steps.length < 4 ||
    steps.some(
      (s) =>
        !s || typeof s.stage !== "string" || !s.stage || !engines.has(s.engine),
    ) ||
    new Set(steps.map((s) => s.stage)).size !== steps.length ||
    new Set(steps.map((s) => s.engine)).size !== steps.length ||
    steps[0].engine !== "intake" ||
    !["ready", "publish"].includes(steps.at(-1)!.engine) ||
    !steps.some((s) => s.engine === "build") ||
    !steps.some((s) => s.engine === "qa") ||
    !steps.some((s) => s.engine === "ready") ||
    steps.findIndex((s) => s.engine === "qa") !==
      steps.findIndex((s) => s.engine === "build") + 1 ||
    steps.findIndex((s) => s.engine === "ready") !==
      steps.findIndex((s) => s.engine === "qa") + 1 ||
    (steps.some((s) => s.engine === "publish") &&
      steps.findIndex((s) => s.engine === "publish") !==
        steps.findIndex((s) => s.engine === "ready") + 1)
  )
    throw new Error("Invalid workflow definition");
  const registered = (
    await db.prepare("SELECT id FROM lifecycle_stages").all<{ id: string }>()
  ).results;
  if (steps.some((s) => !registered.some((r) => r.id === s.stage)))
    throw new Error("Workflow stage is not registered");
  return definition;
}
