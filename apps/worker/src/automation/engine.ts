import type { IdeaInput, Workflow, Job, WorkflowStage } from "./policy";
import {
  generateArtifact,
  policyVersion,
  promotion,
  scoreIdea,
  stageDepartment,
} from "./policy";
const now = () => new Date().toISOString();
const sqlNow = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export const q = (db: D1Database, sql: string, ...values: unknown[]) =>
  db.prepare(sql).bind(...values);
export async function ideaInput(
  db: D1Database,
  id: string,
): Promise<IdeaInput> {
  const row = await q(db, "SELECT * FROM ideas WHERE id=?", id).first<
    Record<string, unknown>
  >();
  if (!row) throw new Error("Workflow idea is missing");
  return {
    submissionKey: row.submission_key as string,
    title: row.title as string,
    problem: row.problem as string,
    audience: row.audience as string,
    requirements: JSON.parse(row.requirements as string),
    successMetrics: JSON.parse(row.success_metrics as string),
    dependencies: JSON.parse(row.dependencies as string),
    platformTargets: JSON.parse(row.platform_targets as string),
    runtimeRequirements: JSON.parse(row.runtime_requirements as string),
    impact: row.impact as number,
    confidence: row.confidence as number,
    effort: row.effort as number,
    risk: row.risk as number,
    source: row.source as string,
    unitId: row.unit_id as string | null,
  };
}
// D1 batch is transactional. The first statement is a compare-and-swap; all subsequent writes
// depend on its unique operation ID. Concurrent/retried runners cannot commit half a transition.
type Extra = (guard: string) => D1PreparedStatement[];
async function change(
  db: D1Database,
  w: Workflow,
  stage: WorkflowStage,
  status: Workflow["status"],
  reason: string,
  extra: Extra = () => [],
  reverse = false,
) {
  const op = crypto.randomUUID();
  const guard = `EXISTS(SELECT 1 FROM automation_workflows WHERE product_id='${w.product_id.replaceAll("'", "''")}' AND last_operation='${op}')`;
  const result = await db.batch([
    q(
      db,
      `UPDATE automation_workflows SET stage=?,status=?,generation=generation+?,version=version+1,last_operation=?,reason=?,updated_at=${sqlNow} WHERE product_id=? AND version=?`,
      stage,
      status,
      reverse ? 1 : 0,
      op,
      reason,
      w.product_id,
      w.version,
    ),
    q(
      db,
      `UPDATE products SET stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${guard}`,
      stage === "Published"
        ? "Live"
        : stage === "Ready"
          ? "Ready"
          : ["Build", "QA"].includes(stage)
            ? "Build"
            : stage === "Idea"
              ? "Idea"
              : "Validation",
      w.product_id,
    ),
    ...extra(guard),
  ]);
  return result[0].meta.changes > 0;
}
async function gate(
  db: D1Database,
  w: Workflow,
  purpose: string,
  target: WorkflowStage,
  reason: string,
) {
  const id = crypto.randomUUID();
  return change(db, w, w.stage, "awaiting_governor", reason, (guard) => [
    q(
      db,
      `INSERT INTO approvals(id,product_id,action,priority,risk) SELECT ?,?,?,?,? WHERE ${guard}`,
      id,
      w.product_id,
      `${purpose === "reverse" ? "Reverse workflow to" : purpose === "publish" ? "Publish" : purpose === "retry" ? "Retry failed work at" : "Accept simulation risk and proceed to"} ${target}: ${reason}`,
      purpose === "risk" ? "High" : "Medium",
      purpose === "risk" ? "High" : "Medium",
    ),
    q(
      db,
      `INSERT INTO automation_gates(approval_id,product_id,generation,purpose,target_stage,expected_version,reason) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
      id,
      w.product_id,
      w.generation,
      purpose,
      target,
      w.version + 1,
      reason,
    ),
  ]);
}
export async function requestReversal(
  db: D1Database,
  w: Workflow,
  target: WorkflowStage,
  reason: string,
) {
  return gate(db, w, "reverse", target, reason);
}
function restorePrerequisites(
  db: D1Database,
  w: Workflow,
  target: WorkflowStage,
  guard: string,
) {
  const kinds = ["discovery", "specification", "architecture", "simulation"];
  const positions = [
    "Discovery",
    "Specification",
    "Architecture",
    "Simulation",
  ];
  const targetIndex = [
    "Idea",
    ...positions,
    "Build",
    "QA",
    "Ready",
    "Published",
  ].indexOf(target);
  const allowed = kinds.filter((_, i) => i + 1 < targetIndex);
  return [
    ...allowed.map((kind) =>
      q(
        db,
        `INSERT INTO automation_artifacts(id,product_id,generation,kind,content,policy_version) SELECT ?,product_id,generation+1,kind,content,policy_version FROM automation_artifacts WHERE product_id=? AND generation=? AND kind=? AND ${guard}`,
        crypto.randomUUID(),
        w.product_id,
        w.generation,
        kind,
      ),
    ),
    ...["Build", "QA"]
      .filter(
        (stage) =>
          ["Idea", ...positions, "Build", "QA", "Ready", "Published"].indexOf(
            stage,
          ) < targetIndex,
      )
      .map((stage) =>
        q(
          db,
          `INSERT INTO automation_jobs(id,product_id,generation,stage,department,status,attempt,result,worker_id) SELECT ?,product_id,generation+1,stage,department,'succeeded',0,json_set(result,'$.restoredFromJob',id),worker_id FROM automation_jobs WHERE product_id=? AND generation=? AND stage=? AND status='succeeded' AND ${guard}`,
          crypto.randomUUID(),
          w.product_id,
          w.generation,
          stage,
        ),
      ),
  ];
}
async function applyGate(db: D1Database, w: Workflow) {
  const g = await q(
    db,
    `SELECT g.*,a.status AS decision FROM automation_gates g JOIN approvals a ON a.id=g.approval_id WHERE g.product_id=? AND g.generation=? AND g.expected_version=? AND g.state='pending'`,
    w.product_id,
    w.generation,
    w.version,
  ).first<{
    approval_id: string;
    purpose: string;
    target_stage: WorkflowStage;
    decision: string;
    reason: string;
  }>();
  if (!g || g.decision === "pending") return false;
  const approved = g.decision === "approved";
  const reverse =
    approved && g.purpose === "reverse" && w.stage !== "Published";
  const stage =
    approved && g.purpose === "risk"
      ? "Build"
      : reverse
        ? g.target_stage
        : w.stage;
  return change(
    db,
    w,
    stage,
    approved ? "active" : "paused",
    `${g.purpose} ${g.decision}: ${g.reason}`,
    (guard) => [
      ...(!approved
        ? [
            q(
              db,
              `UPDATE automation_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=${sqlNow} WHERE product_id=? AND generation=? AND status IN ('queued','leased') AND ${guard}`,
              w.product_id,
              w.generation,
            ),
          ]
        : []),
      q(
        db,
        `UPDATE automation_gates SET state='applied' WHERE approval_id=? AND ${guard}`,
        g.approval_id,
      ),
      ...(approved && g.purpose === "retry"
        ? [
            q(
              db,
              `UPDATE automation_jobs SET status='queued',attempt=0,lease_token=NULL,lease_until=NULL,result=NULL,updated_at=${sqlNow} WHERE product_id=? AND generation=? AND status='failed' AND ${guard}`,
              w.product_id,
              w.generation,
            ),
          ]
        : []),
      ...(reverse
        ? [
            ...restorePrerequisites(db, w, g.target_stage, guard),
            q(
              db,
              `UPDATE automation_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=${sqlNow} WHERE product_id=? AND generation=? AND status IN ('queued','leased') AND ${guard}`,
              w.product_id,
              w.generation,
            ),
          ]
        : []),
      ...(approved && g.purpose === "publish"
        ? [jobInsert(db, w, "Publish", "OPS", guard)]
        : []),
      ...(approved && g.purpose === "reverse" && w.stage === "Published"
        ? [
            q(
              db,
              `UPDATE automation_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=${sqlNow} WHERE product_id=? AND generation=? AND status IN ('queued','leased') AND ${guard}`,
              w.product_id,
              w.generation,
            ),
            jobInsert(db, w, "Compensate", "OPS", guard),
          ]
        : []),
    ],
    reverse,
  );
}
function jobInsert(
  db: D1Database,
  w: Workflow,
  stage: string,
  department: string,
  guard = `EXISTS(SELECT 1 FROM automation_workflows WHERE product_id='${w.product_id.replaceAll("'", "''")}' AND generation=${w.generation} AND status='active')`,
) {
  return q(
    db,
    `INSERT INTO automation_jobs(id,product_id,generation,stage,department) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(product_id,generation,stage) DO NOTHING`,
    crypto.randomUUID(),
    w.product_id,
    w.generation,
    stage,
    department,
  );
}
export async function claimJob(db: D1Database, id: string, workerId: string) {
  const token = crypto.randomUUID();
  const until = new Date(Date.now() + 300000).toISOString();
  const job = await q(
    db,
    `UPDATE automation_jobs SET status='leased',attempt=attempt+1,lease_token=?,lease_until=?,worker_id=?,updated_at=${sqlNow}
 WHERE id=? AND status='queued' AND attempt<3
 AND EXISTS(SELECT 1 FROM automation_workflows w WHERE w.product_id=automation_jobs.product_id AND w.generation=automation_jobs.generation AND w.status='active')
 AND (SELECT COUNT(*) FROM automation_jobs j WHERE j.department=automation_jobs.department AND j.status='leased') < (SELECT capacity FROM automation_resources r WHERE r.department=automation_jobs.department)
 RETURNING *`,
    token,
    until,
    workerId,
    id,
  ).first<Job>();
  return job;
}
async function finishInternal(db: D1Database, w: Workflow, job: Job) {
  const kind = w.stage.toLowerCase();
  const input = await ideaInput(db, w.idea_id);
  const content = JSON.stringify(generateArtifact(kind, input));
  const next = (
    {
      Discovery: "Specification",
      Specification: "Architecture",
      Architecture: "Simulation",
      Simulation: "Build",
    } as Record<string, WorkflowStage>
  )[w.stage];
  // Reserve stage ownership in the workflow CAS as well as the job lease.
  return change(
    db,
    w,
    next,
    "active",
    `${w.stage} completed by ${policyVersion}`,
    (guard) => [
      q(
        db,
        `INSERT INTO automation_artifacts(id,product_id,generation,kind,content,policy_version) SELECT ?,?,?,?,?,? WHERE ${guard}`,
        crypto.randomUUID(),
        w.product_id,
        w.generation,
        kind,
        content,
        policyVersion,
      ),
      q(
        db,
        `UPDATE automation_jobs SET status='succeeded',result=?,updated_at=${sqlNow} WHERE id=? AND lease_token=? AND ${guard}`,
        JSON.stringify({ summary: `Generated ${kind}`, policyVersion }),
        job.id,
        job.lease_token,
      ),
    ],
  );
}
async function refreshPromotion(db: D1Database, w: Workflow) {
  const row = await q(
    db,
    `SELECT p.score,o.health,o.observed_at FROM products p LEFT JOIN product_observations o ON o.product_id=p.id WHERE p.id=?`,
    w.product_id,
  ).first<{
    score: number;
    health: number | null;
    observed_at: string | null;
  }>();
  if (!row) return;
  const sim = await q(
    db,
    "SELECT content FROM automation_artifacts WHERE product_id=? AND generation=? AND kind='simulation'",
    w.product_id,
    w.generation,
  ).first<{ content: string }>();
  const time = Date.parse(row.observed_at ?? "");
  const input = {
    score: row.score,
    health:
      Number.isFinite(time) &&
      time <= Date.now() &&
      Date.now() - time <= 86400000
        ? row.health
        : null,
    forecastScore: sim
      ? (JSON.parse(sim.content) as { forecastScore: number }).forecastScore
      : null,
    stage: w.stage,
    status: w.status,
  };
  const decision = promotion(input);
  const nextAction =
    w.status === "awaiting_governor"
      ? "Governor decision required: approve, reject or override the current request."
      : w.status === "paused"
        ? "Workflow is paused. A producer may request a governed reversal to revisit earlier work."
        : w.status === "complete"
          ? "Monitor fresh health and lifecycle promotion thresholds."
          : (
              {
                Idea: "STRAT qualifies and discovers the opportunity.",
                Discovery: "STRAT processes discovery.",
                Specification: "STRAT generates the specification.",
                Architecture: "ARCH packages the declared constraints.",
                Simulation: "DATA calculates planning scores.",
                Build:
                  "BUILD executes the queued build; progression waits for verified output.",
                QA: "TEST validates the successful Build artifact; progression waits for a passing report.",
                Ready:
                  "OPS publishes after the governor gate is accepted; progression waits for deployment evidence.",
                Published: w.reason.includes("reverse")
                  ? "OPS compensates the prior publication before reversal."
                  : "GROWTH processes the publication handoff.",
              } as Record<string, string>
            )[w.stage];
  const opportunity =
    decision.classification === "Promote"
      ? "Lifecycle, fresh health and planning thresholds support promotion."
      : row.score >= 80 &&
          [
            "Idea",
            "Discovery",
            "Specification",
            "Architecture",
            "Simulation",
          ].includes(w.stage)
        ? "High-scoring qualified idea is progressing through planning."
        : null;
  const risk =
    sim && (JSON.parse(sim.content) as { riskScore: number }).riskScore >= 70
      ? "Simulation risk is at least 70/100; explicit governor acceptance is required before Build."
      : input.health !== null && input.health < 60
        ? "Fresh product health is below the improvement threshold."
        : null;
  const recordedInputs = { ...input, nextAction, opportunity, risk };

  await q(
    db,
    `INSERT INTO automation_promotions(product_id,classification,reason,inputs,policy_version) VALUES(?,?,?,?,?)
 ON CONFLICT(product_id) DO UPDATE SET classification=excluded.classification,reason=excluded.reason,inputs=excluded.inputs,policy_version=excluded.policy_version,updated_at=${sqlNow}
 WHERE classification<>excluded.classification OR inputs<>excluded.inputs`,
    w.product_id,
    decision.classification,
    decision.reason,
    JSON.stringify(recordedInputs),
    policyVersion,
  ).run();
}
async function step(db: D1Database, w: Workflow): Promise<boolean> {
  if (w.status === "awaiting_governor") return applyGate(db, w);
  if (w.status !== "active") return false;
  if (w.stage === "Idea")
    return change(
      db,
      w,
      "Discovery",
      "active",
      "Qualified idea entered discovery",
    );
  if (w.stage === "Published") {
    const reversalGate = await q(
      db,
      "SELECT approval_id FROM automation_gates WHERE product_id=? AND generation=? AND purpose='reverse' AND state='applied'",
      w.product_id,
      w.generation,
    ).first();
    if (!reversalGate) {
      await jobInsert(db, w, "Growth", "GROWTH").run();
      const growth = await q(
        db,
        "SELECT * FROM automation_jobs WHERE product_id=? AND generation=? AND stage='Growth'",
        w.product_id,
        w.generation,
      ).first<Job>();
      if (growth?.status === "failed")
        return gate(db, w, "retry", "Published", "Growth work failed");
      if (growth?.status === "succeeded")
        return change(
          db,
          w,
          "Published",
          "complete",
          "Growth handoff completed with worker evidence",
        );
      return false;
    }
    const job = await q(
      db,
      "SELECT * FROM automation_jobs WHERE product_id=? AND generation=? AND stage='Compensate'",
      w.product_id,
      w.generation,
    ).first<Job>();
    if (!job) return false;
    if (job.status === "failed")
      return gate(
        db,
        w,
        "retry",
        "Published",
        "Publication compensation failed; retry requires governor review",
      );
    if (job.status !== "succeeded") return false;
    const previous = await q(
      db,
      "SELECT target_stage FROM automation_gates WHERE product_id=? AND generation=? AND purpose='reverse' AND state='applied' ORDER BY expected_version DESC LIMIT 1",
      w.product_id,
      w.generation,
    ).first<{ target_stage: WorkflowStage }>();
    if (!previous) return false;
    return change(
      db,
      w,
      previous.target_stage,
      "active",
      "Reversed after verified publication compensation",
      (guard) => [
        ...restorePrerequisites(db, w, previous.target_stage, guard),
        q(
          db,
          `UPDATE automation_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=${sqlNow} WHERE product_id=? AND generation=? AND status IN ('queued','leased') AND ${guard}`,
          w.product_id,
          w.generation,
        ),
      ],
      true,
    );
  }
  if (w.stage === "Build") {
    const sim = await q(
      db,
      "SELECT content FROM automation_artifacts WHERE product_id=? AND generation=? AND kind='simulation'",
      w.product_id,
      w.generation,
    ).first<{ content: string }>();
    const accepted = await q(
      db,
      "SELECT approval_id FROM automation_gates WHERE product_id=? AND generation=? AND purpose='risk' AND state='applied'",
      w.product_id,
      w.generation,
    ).first();
    if (
      sim &&
      (JSON.parse(sim.content) as { riskScore: number }).riskScore >= 70 &&
      !accepted
    )
      return gate(
        db,
        w,
        "risk",
        "Build",
        "Simulation risk score is at least 70/100",
      );
  }
  const stage = w.stage === "Ready" ? "Publish" : w.stage;
  let job = await q(
    db,
    "SELECT * FROM automation_jobs WHERE product_id=? AND generation=? AND stage=?",
    w.product_id,
    w.generation,
    stage,
  ).first<Job>();
  if (!job) {
    if (w.stage === "Ready")
      return gate(
        db,
        w,
        "publish",
        "Published",
        "Build and QA evidence are complete; authorise publication",
      );
    await jobInsert(db, w, stage, stageDepartment[w.stage]).run();
    job = await q(
      db,
      "SELECT * FROM automation_jobs WHERE product_id=? AND generation=? AND stage=?",
      w.product_id,
      w.generation,
      stage,
    ).first<Job>();
  }
  if (!job) return false;
  if (job.status === "failed")
    return gate(
      db,
      w,
      "retry",
      w.stage,
      "Work failed or exhausted three lease attempts",
    );
  if (job.status === "succeeded") {
    const next = (
      { Build: "QA", QA: "Ready", Ready: "Published" } as Record<
        string,
        WorkflowStage
      >
    )[w.stage];
    return next
      ? change(db, w, next, "active", `${stage} completed with worker evidence`)
      : false;
  }
  if (
    ["Discovery", "Specification", "Architecture", "Simulation"].includes(
      w.stage,
    ) &&
    job.status === "queued"
  ) {
    const claimed = await claimJob(db, job.id, "icvs-planner");
    if (claimed) return finishInternal(db, w, claimed);
  }
  return false;
}
async function qualify(db: D1Database) {
  const rows = await db
    .prepare(
      "SELECT id,score,unit_id,title,problem FROM ideas WHERE state='Submitted' ORDER BY created_at,id LIMIT 25",
    )
    .all<{
      id: string;
      score: number;
      unit_id: string | null;
      title: string;
      problem: string;
    }>();
  for (const idea of rows.results) {
    if (idea.score < 50) {
      await q(
        db,
        `UPDATE ideas SET state='Rejected',reason='Qualification score below 50/100',updated_at=${sqlNow} WHERE id=? AND state='Submitted'`,
        idea.id,
      ).run();
      continue;
    }
    const productId = `icvs-${idea.id}`;
    await db.batch([
      q(
        db,
        `INSERT INTO products(id,name,description,stage,score,unit_id) SELECT ?,?,?,'Idea',?,? WHERE EXISTS(SELECT 1 FROM ideas WHERE id=? AND state='Submitted') ON CONFLICT(id) DO NOTHING`,
        productId,
        idea.title,
        idea.problem,
        idea.score,
        idea.unit_id,
        idea.id,
      ),
      q(
        db,
        `UPDATE ideas SET state='Qualified',reason='Qualification score at least 50/100',product_id=?,updated_at=${sqlNow} WHERE id=? AND state='Submitted'`,
        productId,
        idea.id,
      ),
      q(
        db,
        `INSERT INTO automation_workflows(product_id,idea_id,stage,status,last_operation,reason) SELECT ?,?,'Idea','active',?,'Qualified by icvs-v1' WHERE EXISTS(SELECT 1 FROM ideas WHERE id=? AND state='Qualified') ON CONFLICT(product_id) DO NOTHING`,
        productId,
        idea.id,
        crypto.randomUUID(),
        idea.id,
      ),
    ]);
  }
}
export async function runAutomation(db: D1Database, productId?: string) {
  await qualify(db);
  // Expired leases are fenced by their token; external operations must be idempotent by job ID.
  await q(
    db,
    `UPDATE automation_jobs SET status=CASE WHEN attempt>=3 THEN 'failed' ELSE 'queued' END,lease_token=NULL,lease_until=NULL,updated_at=${sqlNow} WHERE status='leased' AND lease_until<=?`,
    now(),
  ).run();
  const count =
    (await db
      .prepare("SELECT COUNT(*) AS count FROM automation_workflows")
      .first<number>("count")) ?? 0;
  const savedCursor =
    (await db
      .prepare("SELECT value FROM automation_scheduler WHERE id=1")
      .first<number>("value")) ?? 0;
  const cursor = savedCursor >= count ? 0 : savedCursor;
  const page = productId
    ? [{ product_id: productId }]
    : (
        await q(
          db,
          "SELECT product_id FROM automation_workflows ORDER BY product_id LIMIT 5 OFFSET ?",
          cursor,
        ).all<{ product_id: string }>()
      ).results;
  if (!productId)
    await q(
      db,
      "UPDATE automation_scheduler SET value=? WHERE id=1",
      cursor + 5 >= count ? 0 : cursor + 5,
    ).run();
  let errors = 0;
  for (const id of page) {
    try {
      for (let iteration = 0; iteration < 10; iteration++) {
        const w = await q(
          db,
          "SELECT * FROM automation_workflows WHERE product_id=?",
          id.product_id,
        ).first<Workflow>();
        if (!w) break;
        await refreshPromotion(db, w);
        if (!(await step(db, w))) break;
      }
    } catch {
      errors++;
      // Do not leak SQL/provider details. Other projects continue; leased work follows the retry policy.
      await q(
        db,
        "INSERT INTO automation_events(product_id,entity_id,kind,action,details) VALUES(?,?,'runner','failed',?)",
        id.product_id,
        id.product_id,
        JSON.stringify({
          reason:
            "Automation processing failed; leased work will be retried after expiry",
        }),
      ).run();
    }
  }
  return { processed: page.length, errors };
}
