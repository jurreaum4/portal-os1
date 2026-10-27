import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";
import {
  intakeEngine,
  specificationEngine,
  architectureEngine,
  simulationEngine,
  scoringEngine,
  promotionEngine,
  archiveEngine,
  validateEvidence,
  type Stage,
  type Brief,
  type ExecutionEvidence,
} from "./icvs/engines";

interface Event {
  id: string;
  sequence: number;
  from: Stage | null;
  to: Stage;
  engine: string;
  actor: string;
  reason: string;
  evidence: unknown;
  at: string;
}
interface Workflow {
  id: string;
  productId: string;
  brief: Brief;
  stage: Stage;
  sequence: number;
  status: "running" | "blocked" | "completed";
  message: string;
  pending?: Event;
  approvalId?: string;
  allocatedFor?: string;
  decision?: { status: string; note: string };
  build?: ExecutionEvidence;
  qa?: ExecutionEvidence;
}
const RETRY_MS = 30_000;

/** Existing per-product DO owns workflow state; D1 is an idempotent projection. */
export class ProductFactoryActor extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    return this.ctx.blockConcurrencyWhile(async () => {
      const body = (await request.json()) as {
        productId: string;
        approvalId?: string;
        status?: string;
        note?: string;
        owner?: string;
      };
      const path = new URL(request.url).pathname;
      if (path === "/allocate" || path === "/release")
        return this.allocate(path, body.owner!);
      let state = await this.ctx.storage.get<Workflow>("workflow");
      if (state && state.productId !== body.productId)
        return Response.json(
          { error: "Actor product mismatch" },
          { status: 409 },
        );
      if (state) await this.project(state);
      if (path === "/decision") {
        if (
          !state ||
          state.approvalId !== body.approvalId ||
          !["approved", "rejected", "overridden"].includes(body.status ?? "")
        )
          return Response.json(
            { error: "Workflow approval not found" },
            { status: 404 },
          );
        if (state.decision)
          return Response.json(
            { error: "Approval has already been decided" },
            { status: 409 },
          );
        state.decision = { status: body.status!, note: body.note ?? "" };
        await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
        await this.transition(
          state,
          body.status === "rejected" ? "Archived" : "Ready",
          body.status === "rejected" ? "Archive" : "Promotion",
          body.status === "rejected"
            ? archiveEngine(
                state.decision.note || "Governor rejected promotion",
              )
            : promotionEngine(state.build, state.qa),
          "governor",
          state.decision.note || body.status!,
        );
        await this.ctx.storage.deleteAlarm();
        return Response.json({ success: true, status: body.status });
      }
      if (state) {
        if (state.status !== "completed")
          await this.ctx.storage.setAlarm(Date.now() + 1);
        return Response.json({
          id: state.id,
          status: state.status,
          stage: state.stage,
          reused: true,
        });
      }
      const product = await this.env.DB.prepare(
        "SELECT name,description,stage FROM products WHERE id=?",
      )
        .bind(body.productId)
        .first<Brief & { stage: string }>();
      if (!product)
        return Response.json({ error: "Product not found" }, { status: 404 });
      // Reuse old planning runs when adopting legacy products; never create two active runs.
      const existing = await this.env.DB.prepare(
        "SELECT id FROM factory_runs WHERE product_id=? AND status IN ('running','blocked')",
      )
        .bind(body.productId)
        .first<{ id: string }>();
      if (
        !["Idea", "Discovery", "Validation"].includes(product.stage) &&
        !(product.stage === "Build" && existing)
      )
        return Response.json(
          {
            error:
              "Automation starts from Idea, Discovery or legacy Validation",
          },
          { status: 409 },
        );
      try {
        intakeEngine(product);
      } catch (error) {
        return Response.json(
          { error: (error as Error).message },
          { status: 422 },
        );
      }
      state = {
        id: existing?.id ?? crypto.randomUUID(),
        productId: body.productId,
        brief: { name: product.name, description: product.description },
        stage: product.stage === "Build" ? "Build" : "Idea",
        sequence: 0,
        status: "running",
        message: "Idea accepted; automation scheduled",
      };
      // Alarm is durable before the first journal entry; it repairs interrupted projections.
      await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
      await this.transition(
        state,
        state.stage,
        "Idea Intake",
        intakeEngine(product),
        "automation",
        "Submitted brief accepted",
      );
      await this.ctx.storage.setAlarm(Date.now() + 1);
      return Response.json(
        { id: state.id, status: state.status, stage: state.stage },
        { status: 201 },
      );
    });
  }

  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.ctx.storage.get<Workflow>("workflow");
      if (!state) return;
      // Keep retrying beyond Cloudflare's bounded automatic alarm retries.
      await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
      try {
        await this.project(state);
        if (state.status !== "completed") await this.advance(state);
      } catch (error) {
        // Pending journals must be replayed first; never overwrite an unprojected transition.
        if (!state.pending)
          await this.block(
            state,
            error instanceof Error ? error.message : "Execution unavailable",
          );
      }
      if (!state.pending && (state.status === "completed" || state.approvalId))
        await this.ctx.storage.deleteAlarm();
      else if (!state.pending && state.status === "running")
        await this.ctx.storage.setAlarm(Date.now() + 1);
    });
  }

  private async advance(state: Workflow) {
    switch (state.stage) {
      case "Idea":
        return this.transition(
          state,
          "Discovery",
          "Workflow",
          { source: state.brief.description },
          "automation",
          "Discovery grounded in submitted brief",
        );
      case "Discovery":
        return this.transition(
          state,
          "Specification",
          "Specification",
          specificationEngine(state.brief),
        );
      case "Specification":
        return this.transition(
          state,
          "Architecture",
          "Architecture",
          architectureEngine(state.brief),
        );
      case "Architecture": {
        const result = simulationEngine(state.brief);
        if (!result.passed) throw new Error("Lifecycle simulation failed");
        return this.transition(state, "Simulation", "Simulation", result);
      }
      case "Simulation":
        return this.transition(state, "Build", "Workflow", {
          handoff: "Execute implementation from specification",
        });
      case "Build":
      case "QA": {
        if (state.approvalId) return;
        if (!this.env.ICVS_EXECUTOR)
          return this.block(
            state,
            "Build and QA executor binding is not configured",
          );
        const resource = this.env.FACTORY_ACTOR!.get(
          this.env.FACTORY_ACTOR!.idFromName("icvs:resource-allocation"),
        );
        const owner = `${state.id}:${state.stage}`;
        const allocation = await resource.fetch(
          "https://factory.internal/allocate",
          { method: "POST", body: JSON.stringify({ owner }) },
        );
        if (!allocation.ok)
          return this.block(state, "Waiting for execution capacity");
        const lease = (await allocation.json()) as { expiresAt: number };
        if (state.allocatedFor !== owner) {
          state.allocatedFor = owner;
          await this.transition(state, state.stage, "Resource Allocation", {
            owner,
            expiresAt: lease.expiresAt,
          });
        }
        let finished = false;
        try {
          const operationId = owner;
          const response = await this.env.ICVS_EXECUTOR.fetch(
            "https://executor.internal/execute",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": operationId,
              },
              body: JSON.stringify({
                operationId,
                leaseExpiresAt: lease.expiresAt,
                productId: state.productId,
                runId: state.id,
                stage: state.stage,
                specification: specificationEngine(state.brief),
                architecture: architectureEngine(state.brief),
                build: state.build,
              }),
              signal: AbortSignal.timeout(20_000),
            },
          );
          if (response.status === 202)
            return this.block(state, "Executor is processing the operation");
          if (!response.ok)
            throw new Error(`Executor returned HTTP ${response.status}`);
          const evidence = validateEvidence(
            await response.json(),
            operationId,
            state.stage === "QA",
            state.build,
          );
          finished = true;
          if (state.stage === "Build") {
            state.build = evidence;
            await this.transition(state, "QA", "Build", evidence);
          } else {
            state.qa = evidence;
            state.approvalId = crypto.randomUUID();
            await this.transition(
              state,
              "QA",
              "Promotion",
              promotionEngine(state.build, state.qa),
              "automation",
              "Build and QA verified; awaiting governor decision",
            );
          }
        } finally {
          if (finished)
            await resource.fetch("https://factory.internal/release", {
              method: "POST",
              body: JSON.stringify({ owner }),
            });
        }
        return;
      }
    }
  }

  private async block(state: Workflow, message: string) {
    if (state.status === "blocked" && state.message === message) return;
    await this.transition(
      state,
      state.stage,
      "Workflow",
      { blocked: true },
      "automation",
      message,
    );
  }

  private async transition(
    state: Workflow,
    to: Stage,
    engine: string,
    evidence: unknown,
    actor = "automation",
    reason = `${engine} completed`,
  ) {
    const blocked =
      (evidence as { blocked?: boolean }).blocked ||
      (!!state.approvalId && !state.decision);
    state.pending = {
      id: `${state.id}:${state.sequence + 1}`,
      sequence: state.sequence + 1,
      from: state.sequence ? state.stage : null,
      to,
      engine,
      actor,
      reason,
      evidence,
      at: new Date().toISOString(),
    };
    state.stage = to;
    state.sequence++;
    state.status = ["Ready", "Archived"].includes(to)
      ? "completed"
      : blocked
        ? "blocked"
        : "running";
    state.message = reason;
    await this.ctx.storage.put("workflow", state);
    await this.project(state);
  }

  private async project(state: Workflow) {
    const event = state.pending;
    if (!event) return;
    const db = this.env.DB;
    const score = scoringEngine(state.stage);
    const statements = [
      db
        .prepare(
          `INSERT INTO factory_runs(id,product_id,status,stage,message) VALUES (?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status,stage=excluded.stage,message=excluded.message,updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(
          state.id,
          state.productId,
          state.status,
          state.stage,
          state.message,
        ),
      db
        .prepare(
          "UPDATE products SET stage=?,score=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(
          state.stage,
          score.score,
          state.stage === "Archived"
            ? "Paused"
            : state.status === "blocked"
              ? "Attention"
              : "On track",
          state.productId,
        ),
      db
        .prepare(
          "INSERT OR IGNORE INTO workflow_events(id,run_id,product_id,sequence,from_stage,to_stage,engine,actor,reason,evidence,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          event.id,
          state.id,
          state.productId,
          event.sequence,
          event.from,
          event.to,
          event.engine,
          event.actor,
          event.reason,
          JSON.stringify(event.evidence),
          event.at,
        ),
      db
        .prepare(
          "INSERT OR IGNORE INTO factory_outputs(id,run_id,engine,content) VALUES (?,?,?,?)",
        )
        .bind(event.id, state.id, event.engine, JSON.stringify(event.evidence)),
      db
        .prepare(
          "INSERT OR IGNORE INTO factory_outputs(id,run_id,engine,content) VALUES (?,?,'Project Scoring',?)",
        )
        .bind(`${event.id}:score`, state.id, JSON.stringify(score)),
      db
        .prepare(
          "INSERT OR IGNORE INTO activity(id,product_id,title,department) VALUES (?,?,?,'STRAT')",
        )
        .bind(
          event.id,
          state.productId,
          `${state.brief.name}: ${event.from ?? "Intake"} → ${event.to}: ${event.reason}`,
        ),
    ];
    if (state.approvalId) {
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO approvals(id,product_id,action,priority,risk) VALUES (?,?,'Promote verified project to Ready','Medium','Low')",
          )
          .bind(state.approvalId, state.productId),
        db
          .prepare(
            "INSERT OR IGNORE INTO workflow_approvals(approval_id,run_id) VALUES (?,?)",
          )
          .bind(state.approvalId, state.id),
      );
      if (state.decision)
        statements.push(
          db
            .prepare(
              "UPDATE approvals SET status=?,decision_note=?,decided_at=? WHERE id=? AND status='pending'",
            )
            .bind(
              state.decision.status,
              state.decision.note,
              event.at,
              state.approvalId,
            ),
        );
    }
    await db.batch(statements);
    delete state.pending;
    await this.ctx.storage.put("workflow", state);
  }

  /** Portfolio-wide admission uses another instance of the existing actor class. */
  private async allocate(path: string, owner: string) {
    if (typeof owner !== "string" || !owner)
      return Response.json({ error: "Owner required" }, { status: 400 });
    const now = Date.now();
    const leases =
      (await this.ctx.storage.get<Record<string, number>>("leases")) ?? {};
    for (const [key, expires] of Object.entries(leases))
      if (expires <= now) delete leases[key];
    if (path === "/release") delete leases[owner];
    else {
      const configured = Number(this.env.ICVS_EXECUTION_SLOTS ?? 2);
      const capacity =
        Number.isInteger(configured) && configured > 0 && configured <= 100
          ? configured
          : 2;
      if (!leases[owner] && Object.keys(leases).length >= capacity)
        return Response.json({ allocated: false }, { status: 429 });
      leases[owner] = now + 60_000;
    }
    await this.ctx.storage.put("leases", leases);
    return Response.json({
      allocated: path === "/allocate",
      expiresAt: leases[owner] ?? null,
    });
  }
}
