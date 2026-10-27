import type { Env } from "./types";
export function executionCapacity(raw: string | undefined): number {
  const n = Number(raw ?? 2);
  return Number.isInteger(n) && n > 0 && n <= 100 ? n : 2;
}
interface Operation {
  id: string;
  productId: string;
  runId: string;
  worker: string;
  leaseExpiresAt: number;
}
/** Persist attempts before invoking a trusted adapter; only validated receipts mark success. */
export async function executeTracked<T>(
  env: Env,
  operation: Operation,
  binding: Fetcher,
  url: string,
  body: unknown,
  validate: (input: unknown) => T,
): Promise<T | null> {
  const { id, productId, runId, worker, leaseExpiresAt } = operation;
  const saved = await env.DB.prepare(
    "SELECT product_id AS productId,run_id AS runId,worker,status,evidence FROM worker_operations WHERE id=?",
  )
    .bind(id)
    .first<{
      productId: string;
      runId: string;
      worker: string;
      status: string;
      evidence: string | null;
    }>();
  if (
    saved &&
    (saved.productId !== productId ||
      saved.runId !== runId ||
      saved.worker !== worker)
  )
    throw new Error("Operation identity does not match its recorded owner");
  if (saved?.status === "verified" && saved.evidence)
    return validate(JSON.parse(saved.evidence));
  await env.DB.prepare(
    `INSERT INTO worker_operations(id,product_id,run_id,worker,attempts,status,lease_expires_at) VALUES (?,?,?,?,1,'running',?)
 ON CONFLICT(id) DO UPDATE SET attempts=attempts+1,status='running',lease_expires_at=excluded.lease_expires_at,message='',updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(id, productId, runId, worker, leaseExpiresAt)
    .run();
  try {
    const response = await binding.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": id },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 202) {
      await env.DB.prepare(
        "UPDATE worker_operations SET status='pending',message='Adapter still processing',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      )
        .bind(id)
        .run();
      return null;
    }
    if (!response.ok)
      throw new Error(`${worker} adapter returned HTTP ${response.status}`);
    if (Date.now() >= leaseExpiresAt)
      throw new Error("Execution lease expired before evidence was received");
    const evidence = validate(await response.json());
    await env.DB.prepare(
      "UPDATE worker_operations SET status='verified',evidence=?,message='',updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
      .bind(JSON.stringify(evidence), id)
      .run();
    return evidence;
  } catch (e) {
    await env.DB.prepare(
      "UPDATE worker_operations SET status='blocked',message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
      .bind(e instanceof Error ? e.message : "Execution unavailable", id)
      .run();
    throw e;
  }
}
export interface CompensationPlan {
  buildArtifact: string;
  buildDigest: string;
  packageDigest: string;
}
export function validateCompensation(
  input: unknown,
  operationId: string,
  plan: CompensationPlan,
) {
  const r = input as Record<string, unknown> | null;
  if (
    !r ||
    r.operationId !== operationId ||
    r.buildArtifact !== plan.buildArtifact ||
    r.buildDigest !== plan.buildDigest ||
    r.packageDigest !== plan.packageDigest ||
    r.reversed !== true ||
    typeof r.receipt !== "string" ||
    r.receipt.length > 2000 ||
    !r.receipt.startsWith("https://")
  )
    throw new Error("Compensation evidence does not match the approved target");
  const receipt = new URL(r.receipt);
  if (receipt.username || receipt.password)
    throw new Error("Invalid compensation receipt");
  return { operationId, ...plan, reversed: true, receipt: receipt.href };
}
export async function reconcileCompensation(env: Env) {
  const jobs = await env.DB.prepare(
    `SELECT id,product_id AS productId,run_id AS runId,plan,attempts FROM compensation_jobs WHERE status!='completed' AND lease_until<? AND next_attempt<=? ORDER BY updated_at LIMIT 25`,
  )
    .bind(Date.now(), Date.now())
    .all<{
      id: string;
      productId: string;
      runId: string;
      plan: string;
      attempts: number;
    }>();
  for (const job of jobs.results) {
    const lease = Date.now() + 60000;
    const claim = await env.DB.prepare(
      "UPDATE compensation_jobs SET lease_until=?,status='running',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_until<? AND status!='completed'",
    )
      .bind(lease, job.id, Date.now())
      .run();
    if (!claim.meta.changes) continue;
    try {
      if (!env.ICVS_COMPENSATOR)
        throw new Error("Compensation service binding is not configured");
      const plan = JSON.parse(job.plan) as CompensationPlan;
      if (
        typeof plan.buildArtifact !== "string" ||
        typeof plan.buildDigest !== "string" ||
        typeof plan.packageDigest !== "string"
      )
        throw new Error("Verified compensation plan is missing");
      const evidence = await executeTracked(
        env,
        {
          id: job.id,
          productId: job.productId,
          runId: job.runId,
          worker: "Compensation",
          leaseExpiresAt: lease,
        },
        env.ICVS_COMPENSATOR,
        "https://compensator.internal/compensate",
        {
          operationId: job.id,
          productId: job.productId,
          runId: job.runId,
          leaseExpiresAt: lease,
          plan,
        },
        (input) => validateCompensation(input, job.id, plan),
      );
      if (!evidence) throw new Error("Compensation is processing");
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE compensation_jobs SET status='completed',evidence=?,lease_until=0,message='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_until=?",
        ).bind(JSON.stringify(evidence), job.id, lease),
        env.DB.prepare(
          "INSERT OR IGNORE INTO activity(id,product_id,title,department,kind) VALUES (?,?,'Rejected package resources compensated with verified evidence','OPS','info')",
        ).bind(job.id, job.productId),
      ]);
    } catch (e) {
      const delay = Math.min(900000, 30000 * 2 ** Math.min(job.attempts, 5));
      await env.DB.prepare(
        "UPDATE compensation_jobs SET status='blocked',message=?,lease_until=0,next_attempt=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_until=?",
      )
        .bind(
          e instanceof Error ? e.message : "Compensation unavailable",
          Date.now() + delay,
          job.id,
          lease,
        )
        .run();
    }
  }
}
