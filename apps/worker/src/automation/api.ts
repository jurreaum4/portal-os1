import { automationSummary } from "./read-model";
import type { AutomationProject } from "../../../automation-contract";
import type { Env } from "../types";
import { authorised } from "../services/authorisation";
import {
  claimJob,
  ideaInput,
  q,
  requestReversal,
  runAutomation,
} from "./engine";
import { scoreIdea, workflowStages } from "./policy";
import type { IdeaInput, Job, Workflow, WorkflowStage } from "./policy";
const json = (body: unknown, status = 200) => Response.json(body, { status });
export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
async function bodyObject(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("JSON object required");
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 32768) {
      await reader.cancel();
      throw new InputError("Request exceeds 32 KiB", 413);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InputError("Invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new InputError("JSON object required");
  return parsed as Record<string, unknown>;
}
function text(value: unknown, name: string, max = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new InputError(
      `${name} must be non-empty and at most ${max} characters`,
    );
  return value.trim();
}
function list(value: unknown, name: string, allowEmpty = false): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    (!allowEmpty && !value.length)
  )
    throw new InputError(
      `${name} must contain ${allowEmpty ? "0" : "1"}–30 entries`,
    );
  return value.map((v) => text(v, name, 500));
}
function number(value: unknown, name: string, max = 100): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > max
  )
    throw new InputError(`${name} must be an integer from 0 to ${max}`);
  return value;
}
function parseIdea(b: Record<string, unknown>): IdeaInput {
  if (
    !Array.isArray(b.successMetrics) ||
    !b.successMetrics.length ||
    b.successMetrics.length > 30
  )
    throw new InputError("At least one success metric is required");
  const successMetrics = b.successMetrics.map((v) => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new InputError("Invalid success metric");
    const m = v as Record<string, unknown>;
    if (typeof m.target !== "number" || !Number.isFinite(m.target))
      throw new InputError("Metric target must be finite");
    return {
      name: text(m.name, "Metric name", 100),
      target: m.target,
      unit: text(m.unit, "Metric unit", 100),
    };
  });
  return {
    submissionKey: text(b.submissionKey, "submissionKey", 100),
    title: text(b.title, "title", 200),
    problem: text(b.problem, "problem", 2000),
    audience: text(b.audience, "audience", 1000),
    requirements: list(b.requirements, "requirements"),
    successMetrics,
    dependencies: list(b.dependencies, "dependencies", true),
    platformTargets: list(b.platformTargets, "platformTargets"),
    runtimeRequirements: list(b.runtimeRequirements, "runtimeRequirements"),
    impact: number(b.impact, "impact"),
    confidence: number(b.confidence, "confidence"),
    effort: number(b.effort, "effort"),
    risk: number(b.risk, "risk"),
    source: text(b.source, "source", 200),
    unitId: b.unitId == null ? null : text(b.unitId, "unitId", 100),
  };
}
async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function completeJob(
  db: D1Database,
  id: string,
  b: Record<string, unknown>,
) {
  const leaseToken = text(b.leaseToken, "leaseToken", 100);
  const workerId = text(b.workerId, "workerId", 200);
  if (b.outcome !== "succeeded" && b.outcome !== "failed")
    throw new InputError("outcome must be succeeded or failed");
  const summary = text(b.summary, "summary", 2000);
  const job = await q(
    db,
    "SELECT * FROM automation_jobs WHERE id=?",
    id,
  ).first<Job>();
  if (!job) throw new InputError("Job not found", 404);
  const result: Record<string, unknown> = { summary };
  if (b.outcome === "succeeded") {
    const evidenceUrl = text(b.evidenceUrl, "evidenceUrl", 2000);
    let url: URL;
    try {
      url = new URL(evidenceUrl);
    } catch {
      throw new InputError("Invalid evidence URL");
    }
    if (url.protocol !== "https:" || url.username || url.password)
      throw new InputError(
        "Evidence must use HTTPS without embedded credentials",
      );
    const digest = text(b.sha256, "sha256", 64);
    if (!/^[a-f0-9]{64}$/.test(digest))
      throw new InputError("sha256 must contain 64 lowercase hex characters");
    Object.assign(result, { evidenceUrl, sha256: digest });
    if (["QA", "Publish"].includes(job.stage)) {
      const build = await q(
        db,
        "SELECT result FROM automation_jobs WHERE product_id=? AND generation=? AND stage='Build' AND status='succeeded'",
        job.product_id,
        job.generation,
      ).first<{ result: string }>();
      const expected = build
        ? (JSON.parse(build.result) as { sha256?: string }).sha256
        : null;
      if (!expected || b.buildSha256 !== expected)
        throw new InputError(
          "Result must reference the successful Build SHA-256",
        );
      result.buildSha256 = b.buildSha256;
    }

    if (job.stage === "QA") {
      const total = number(b.totalTests, "totalTests", 1000000);
      const passed = number(b.passedTests, "passedTests", 1000000);
      if (total === 0 || passed !== total)
        throw new InputError(
          "QA requires all tests to pass and a non-zero test count",
        );
      Object.assign(result, { totalTests: total, passedTests: passed });
    }
  }
  if (!["Build", "QA", "Publish", "Compensate", "Growth"].includes(job.stage))
    throw new InputError(
      "Only external work can be completed by integration workers",
      409,
    );
  const update = await q(
    db,
    `UPDATE automation_jobs SET status=?,result=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='leased' AND lease_token=? AND worker_id=? AND lease_until>? AND EXISTS(SELECT 1 FROM automation_workflows w WHERE w.product_id=automation_jobs.product_id AND w.generation=automation_jobs.generation AND w.status='active')`,
    b.outcome,
    JSON.stringify(result),
    id,
    leaseToken,
    workerId,
    new Date().toISOString(),
  ).run();
  if (!update.meta.changes)
    throw new InputError("Lease expired, completed or superseded", 409);
  await runAutomation(db, job.product_id);
  return { success: true };
}
export async function routeAutomation(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.DB) return json({ error: "Storage is not configured" }, 503);
  const path = new URL(request.url).pathname;
  try {
    if (request.method === "GET") {
      if (path === "/api/automation")
        return json(await automationSummary(env.DB));
      if (path === "/api/ideas")
        return json(
          (
            await env.DB.prepare(
              "SELECT id,title,state,score,reason,product_id AS productId,created_at AS createdAt FROM ideas ORDER BY created_at DESC LIMIT 100",
            ).all()
          ).results,
        );
      const detail = path.match(/^\/api\/automation\/projects\/([^/]+)$/);
      if (detail) {
        let id: string;
        try {
          id = decodeURIComponent(detail[1]);
        } catch {
          throw new InputError("Invalid project ID");
        }
        const workflow = await q(
          env.DB,
          "SELECT * FROM automation_workflows WHERE product_id=?",
          id,
        ).first<Workflow>();
        if (!workflow) return json({ error: "Managed project not found" }, 404);
        const [artifacts, jobs, events] = await env.DB.batch([
          q(
            env.DB,
            "SELECT * FROM automation_artifacts WHERE product_id=? ORDER BY created_at",
            id,
          ),
          q(
            env.DB,
            "SELECT id,product_id,generation,stage,department,status,attempt,worker_id,lease_until,result,created_at,updated_at FROM automation_jobs WHERE product_id=? ORDER BY created_at",
            id,
          ),
          q(
            env.DB,
            "SELECT * FROM automation_events WHERE product_id=? ORDER BY id DESC LIMIT 200",
            id,
          ),
        ]);
        return json({
          workflow,
          artifacts: (artifacts.results as AutomationProject["artifacts"]).map(
            (a) => ({
              ...a,
              content: JSON.parse(a.content as string) as unknown,
            }),
          ),
          jobs: jobs.results,
          events: events.results,
        });
      }
      if (path === "/api/automation/jobs") {
        if (
          !env.OBSERVATION_API_TOKEN ||
          !(await authorised(request, env.OBSERVATION_API_TOKEN))
        )
          return json({ error: "Integration authorisation required" }, 401);
        return json(
          (
            await env.DB.prepare(
              "SELECT j.id,j.product_id,j.generation,j.stage,j.department,j.status,j.attempt,j.created_at FROM automation_jobs j JOIN automation_workflows w ON w.product_id=j.product_id AND w.generation=j.generation WHERE j.status='queued' AND w.status='active' AND j.stage IN ('Build','QA','Publish','Compensate','Growth') ORDER BY j.created_at LIMIT 100",
            ).all()
          ).results,
        );
      }
      return json({ error: "Automation route not found" }, 404);
    }
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    if (!env.OBSERVATION_API_TOKEN)
      return json({ error: "Integration access is not configured" }, 503);
    if (!(await authorised(request, env.OBSERVATION_API_TOKEN)))
      return json({ error: "Integration authorisation required" }, 401);
    if (path === "/api/automation/run")
      return json(await runAutomation(env.DB));
    const b = await bodyObject(request);
    if (path === "/api/ideas") {
      const input = parseIdea(b);
      const fingerprint = await hash(JSON.stringify(input));
      if (
        input.unitId &&
        !(await q(
          env.DB,
          "SELECT id FROM portfolio_units WHERE id=?",
          input.unitId,
        ).first())
      )
        throw new InputError("Unknown portfolio division");
      const id = crypto.randomUUID();
      await q(
        env.DB,
        `INSERT INTO ideas(id,submission_key,request_hash,title,problem,audience,requirements,success_metrics,dependencies,platform_targets,runtime_requirements,impact,confidence,effort,risk,score,source,unit_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(submission_key) DO NOTHING`,
        id,
        input.submissionKey,
        fingerprint,
        input.title,
        input.problem,
        input.audience,
        JSON.stringify(input.requirements),
        JSON.stringify(input.successMetrics),
        JSON.stringify(input.dependencies),
        JSON.stringify(input.platformTargets),
        JSON.stringify(input.runtimeRequirements),
        input.impact,
        input.confidence,
        input.effort,
        input.risk,
        scoreIdea(input),
        input.source,
        input.unitId,
      ).run();
      const saved = await q(
        env.DB,
        "SELECT id,request_hash FROM ideas WHERE submission_key=?",
        input.submissionKey,
      ).first<{ id: string; request_hash: string }>();
      if (saved?.request_hash !== fingerprint)
        return json(
          { error: "submissionKey already used with different input" },
          409,
        );
      await runAutomation(env.DB, `icvs-${saved.id}`);
      return json(
        await q(
          env.DB,
          "SELECT id,title,state,score,reason,product_id AS productId FROM ideas WHERE id=?",
          saved.id,
        ).first(),
        saved.id === id ? 201 : 200,
      );
    }
    const jobRoute = path.match(
      /^\/api\/automation\/jobs\/([^/]+)\/(claim|complete|heartbeat)$/,
    );
    if (jobRoute) {
      let id: string;
      try {
        id = decodeURIComponent(jobRoute[1]);
      } catch {
        throw new InputError("Invalid job ID");
      }
      if (jobRoute[2] === "heartbeat") {
        const token = text(b.leaseToken, "leaseToken", 100),
          workerId = text(b.workerId, "workerId", 200);
        const until = new Date(Date.now() + 300000).toISOString();
        const result = await q(
          env.DB,
          `UPDATE automation_jobs SET lease_until=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='leased' AND lease_token=? AND worker_id=? AND lease_until>? AND EXISTS(SELECT 1 FROM automation_workflows w WHERE w.product_id=automation_jobs.product_id AND w.generation=automation_jobs.generation AND w.status='active')`,
          until,
          id,
          token,
          workerId,
          new Date().toISOString(),
        ).run();
        return result.meta.changes
          ? json({ success: true, leaseUntil: until })
          : json({ error: "Lease expired, completed or superseded" }, 409);
      }
      if (jobRoute[2] === "complete")
        return json(await completeJob(env.DB, id, b));
      const existing = await q(
        env.DB,
        "SELECT * FROM automation_jobs WHERE id=?",
        id,
      ).first<Job>();
      if (!existing) return json({ error: "Job not found" }, 404);
      if (
        !["Build", "QA", "Publish", "Compensate", "Growth"].includes(
          existing.stage,
        )
      )
        return json(
          { error: "Internal planning jobs are reserved for ICVS" },
          409,
        );
      const job = await claimJob(env.DB, id, text(b.workerId, "workerId", 200));
      if (!job)
        return json(
          { error: "Job unavailable or department at capacity" },
          409,
        );
      const workflow = await q(
        env.DB,
        "SELECT * FROM automation_workflows WHERE product_id=?",
        job.product_id,
      ).first<Workflow>();
      const artifacts = (
        await q(
          env.DB,
          "SELECT kind,content FROM automation_artifacts WHERE product_id=? AND generation=?",
          job.product_id,
          job.generation,
        ).all()
      ).results.map((a) => ({
        ...a,
        content: JSON.parse(a.content as string) as unknown,
      }));
      const gateContext = (
        await q(
          env.DB,
          "SELECT purpose,target_stage,reason FROM automation_gates WHERE product_id=? AND generation=? AND state='applied' ORDER BY created_at DESC",
          job.product_id,
          job.generation,
        ).all()
      ).results;
      const priorWork = (
        await q(
          env.DB,
          "SELECT id,stage,result FROM automation_jobs WHERE product_id=? AND generation=? AND status='succeeded'",
          job.product_id,
          job.generation,
        ).all()
      ).results;
      return json({ ...job, workflow, artifacts, priorWork, gateContext });
    }
    if (path === "/api/automation/resources") {
      const department = text(b.department, "department", 20);
      const capacity = number(b.capacity, "capacity");
      if (
        ![
          "GOV",
          "STRAT",
          "ARCH",
          "BUILD",
          "TEST",
          "OPS",
          "DATA",
          "GROWTH",
        ].includes(department)
      )
        throw new InputError("Unknown department");
      await q(
        env.DB,
        "UPDATE automation_resources SET capacity=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE department=? AND capacity<>?",
        capacity,
        department,
        capacity,
      ).run();
      await runAutomation(env.DB);
      return json({ success: true });
    }
    const reversal = path.match(
      /^\/api\/automation\/projects\/([^/]+)\/reversal$/,
    );
    if (reversal) {
      let id: string;
      try {
        id = decodeURIComponent(reversal[1]);
      } catch {
        throw new InputError("Invalid project ID");
      }
      const w = await q(
        env.DB,
        "SELECT * FROM automation_workflows WHERE product_id=?",
        id,
      ).first<Workflow>();
      if (!w) return json({ error: "Managed project not found" }, 404);
      if (
        !workflowStages.includes(b.targetStage as WorkflowStage) ||
        workflowStages.indexOf(b.targetStage as WorkflowStage) >=
          workflowStages.indexOf(w.stage)
      )
        throw new InputError(
          "Reversal target must be an earlier workflow stage",
        );
      if (b.expectedVersion !== w.version)
        return json({ error: "Workflow version changed" }, 409);
      if (w.status === "awaiting_governor")
        return json(
          { error: "Resolve the existing governor request first" },
          409,
        );
      const reason = text(b.reason, "reason", 1000);
      if (reason.length < 10)
        throw new InputError(
          "Reversal reason must have at least 10 characters",
        );
      return (await requestReversal(
        env.DB,
        w,
        b.targetStage as WorkflowStage,
        reason,
      ))
        ? json({ success: true }, 201)
        : json({ error: "Workflow version changed" }, 409);
    }
    return json({ error: "Automation route not found" }, 404);
  } catch (error) {
    if (error instanceof InputError)
      return json({ error: error.message }, error.status);
    throw error;
  }
}
