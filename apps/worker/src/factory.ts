import { applyUniverseEvent } from "./universe/api";
import { loadDefinition, type WorkflowDefinition } from "./icvs/definition";
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
  definition?: WorkflowDefinition;
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
      if (new URL(request.url).pathname === "/universe/event")
        return applyUniverseEvent(request, this.env);
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
      if (state) {
        state.definition ??= await loadDefinition(this.env.DB, true);
        await this.project(state);
      }
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
          body.status === "rejected"
            ? "Archived"
            : state.definition!.steps.find((s) => s.engine === "ready")!.stage,
          body.status === "rejected" ? "Archive" : "Promotion",
          body.status === "rejected"
            ? archiveEngine(
                state.decision.note || "Governor rejected promotion",
              )
            : promotionEngine(state.build, state.qa),
          "governor",
          state.decision.note || body.status!,
        );
        if (state.status === "completed") await this.ctx.storage.deleteAlarm();
        else await this.ctx.storage.setAlarm(Date.now() + 1);
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
      const definition = await loadDefinition(this.env.DB);
      if (
        ![
          definition.steps[0].stage,
          "Idea",
          "Discovery",
          "Validation",
        ].includes(product.stage) &&
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
        definition,
        id: existing?.id ?? crypto.randomUUID(),
        productId: body.productId,
        brief: { name: product.name, description: product.description },
        stage: product.stage === "Build" ? "Build" : definition.steps[0].stage,
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
      state.definition ??= await loadDefinition(this.env.DB, true);
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
      if (
        !state.pending &&
        (state.status === "completed" || (state.approvalId && !state.decision))
      )
        await this.ctx.storage.deleteAlarm();
      else if (!state.pending && state.status === "running")
        await this.ctx.storage.setAlarm(Date.now() + 1);
    });
  }

  private async advance(state: Workflow) {
    const steps = state.definition!.steps;
    const index = steps.findIndex((s) => s.stage === state.stage);
    if (index < 0) throw new Error("Stage not present in pinned workflow");
    const current = steps[index];
    const next = steps[index + 1];
    if (current.engine === "ready" && next?.engine === "publish") {
      if (!state.decision || state.decision.status === "rejected")
        throw new Error("Publishing requires governor approval");
      if (!this.env.ICVS_EXECUTOR)
        return this.block(state, "Publishing executor is not configured");
      const operationId = `${state.id}:Publish`;
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
            productId: state.productId,
            runId: state.id,
            stage: next.stage,
            build: state.build,
            qa: state.qa,
            decision: state.decision,
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (response.status === 202)
        return this.block(state, "Publishing is in progress");
      if (!response.ok)
        throw new Error(`Publishing returned HTTP ${response.status}`);
      const evidence = validateEvidence(
        await response.json(),
        operationId,
        false,
      );
      if (evidence.digest !== state.build?.digest)
        throw new Error(
          "Published artifact digest differs from approved build",
        );
      return this.transition(state, next.stage, "Publishing", evidence);
    }
    if (current.engine !== "build" && current.engine !== "qa") {
      if (!next) return;
      if (next.engine === "research") {
        const findings = (
          await this.env.DB.prepare(
            "SELECT id,data,source,updated_at FROM universe_records WHERE deleted=0 AND kind='observation' AND json_extract(data,'$.entityId')=? ORDER BY updated_at",
          )
            .bind(`product:${state.productId}`)
            .all()
        ).results;
        return this.transition(state, next.stage, "Research", {
          question: state.brief.description,
          findings,
          coverage: findings.length
            ? "Connected source observations"
            : "No external observations connected; brief-only context",
        });
      }
      const engines: Record<string, () => unknown> = {
        discovery: () => ({ source: state.brief.description }),
        specification: () => specificationEngine(state.brief),
        architecture: () => architectureEngine(state.brief),
        simulation: () =>
          simulationEngine(
            state.brief,
            steps.map((s) => s.stage),
          ),
        build: () => ({ handoff: "Execute implementation from specification" }),
      };
      const engine = engines[next.engine];
      if (!engine) throw new Error("Unsupported automatic engine transition");
      return this.transition(state, next.stage, next.engine, engine());
    }
    {
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
          current.engine === "qa",
          state.build,
        );
        finished = true;
        if (current.engine === "build") {
          state.build = evidence;
          if (!next || next.engine !== "qa")
            throw new Error("Build must be followed by QA");
          await this.transition(state, next.stage, "Build", evidence);
        } else {
          state.qa = evidence;
          state.approvalId = crypto.randomUUID();
          await this.transition(
            state,
            state.stage,
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
    state.status =
      to === "Archived" || to === state.definition!.steps.at(-1)!.stage
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
    const score = scoringEngine(
      state.stage,
      state.definition!.steps.map((s) => s.stage),
    );
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
    if (
      state.definition!.steps.find((s) => s.stage === event.to)?.engine ===
      "publish"
    ) {
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO deployments(id,product_id,environment,status) VALUES (?,?,'production','succeeded')",
          )
          .bind(event.id, state.productId),
      );
    }
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
