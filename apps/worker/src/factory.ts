import {
  validatePackage,
  validatePublication,
  type ReleasePackage,
  type Publication,
} from "../../../icvs/releases";
import { sha256 } from "./access";
import { executeTracked, executionCapacity } from "./execution";
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
  version?: 2;
  package?: ReleasePackage;
  packageDigest?: string;
  publication?: Publication;
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
        actor?: string;
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
        if (
          state.version === 2 &&
          body.status !== "rejected" &&
          (!state.package || !state.packageDigest)
        )
          return Response.json(
            { error: "Verified package required" },
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
          body.actor ?? "governor",
          state.decision.note || body.status!,
        );
        if (state.version === 2 && state.stage === "Ready")
          await this.ctx.storage.setAlarm(Date.now() + 1);
        else await this.ctx.storage.deleteAlarm();
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
        version: existing ? undefined : 2,
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
    if (state.approvalId && !state.decision) return;
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
          const evidence = await executeTracked(
            this.env,
            {
              id: operationId,
              productId: state.productId,
              runId: state.id,
              worker: state.stage,
              leaseExpiresAt: lease.expiresAt,
            },
            this.env.ICVS_EXECUTOR,
            "https://executor.internal/execute",
            {
              operationId,
              leaseExpiresAt: lease.expiresAt,
              productId: state.productId,
              runId: state.id,
              stage: state.stage,
              specification: specificationEngine(state.brief),
              architecture: architectureEngine(state.brief),
              build: state.build,
            },
            (input) =>
              validateEvidence(
                input,
                operationId,
                state.stage === "QA",
                state.build,
              ),
          );
          if (!evidence)
            return this.block(state, "Executor is processing the operation");
          finished = true;
          if (state.stage === "Build") {
            state.build = evidence;
            await this.transition(state, "QA", "Build", evidence);
          } else {
            state.qa = evidence;
            if (state.version === 2) {
              await this.transition(state, "Package", "QA", evidence);
              return;
            }
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
      case "Package": {
        if (!this.env.ICVS_EXECUTOR || !state.build || !state.qa)
          return this.block(
            state,
            "Package executor and verified build/QA are required",
          );
        const operationId = `${state.id}:Package`;
        const packaged = await this.leasedExecution(
          state,
          "Package",
          this.env.ICVS_EXECUTOR,
          "https://executor.internal/execute",
          {
            operationId,
            productId: state.productId,
            runId: state.id,
            stage: "Package",
            build: state.build,
            qa: state.qa,
          },
          (input) =>
            validatePackage(input, operationId, state.build!, state.qa!),
        );
        if (!packaged)
          return this.block(
            state,
            "Packaging is pending or awaiting execution capacity",
          );
        state.package = packaged;
        state.packageDigest = await sha256(JSON.stringify(state.package));
        state.approvalId = crypto.randomUUID();
        return this.transition(
          state,
          "Package",
          "Promotion",
          { package: state.package, packageDigest: state.packageDigest },
          "automation",
          "Package verified; awaiting governor release decision",
        );
      }
      case "Ready": {
        if (state.version !== 2) return;
        if (
          !state.package ||
          !state.packageDigest ||
          !state.decision ||
          state.decision.status === "rejected"
        )
          throw new Error("Release approval and package are required");
        if (!this.env.ICVS_PUBLISHER)
          return this.block(
            state,
            "Publishing service binding is not configured",
          );
        const operationId = `${state.id}:Publish`;
        const publication = await this.leasedExecution(
          state,
          "Publishing",
          this.env.ICVS_PUBLISHER,
          "https://publisher.internal/publish",
          {
            operationId,
            productId: state.productId,
            runId: state.id,
            package: state.package,
            packageDigest: state.packageDigest,
            approvalId: state.approvalId,
          },
          (input) =>
            validatePublication(input, operationId, state.packageDigest!),
        );
        if (!publication)
          return this.block(
            state,
            "Publishing is pending or awaiting execution capacity",
          );
        state.publication = publication;
        return this.transition(
          state,
          "Published",
          "Publishing",
          state.publication,
        );
      }
    }
  }

  private async leasedExecution<T>(
    state: Workflow,
    worker: string,
    binding: Fetcher,
    url: string,
    body: Record<string, unknown>,
    validate: (input: unknown) => T,
  ): Promise<T | null> {
    const id = String(body.operationId);
    const resource = this.env.FACTORY_ACTOR!.get(
      this.env.FACTORY_ACTOR!.idFromName("icvs:resource-allocation"),
    );
    const allocation = await resource.fetch(
      "https://factory.internal/allocate",
      { method: "POST", body: JSON.stringify({ owner: id }) },
    );
    if (!allocation.ok) return null;
    const lease = (await allocation.json()) as { expiresAt: number };
    const evidence = await executeTracked(
      this.env,
      {
        id,
        productId: state.productId,
        runId: state.id,
        worker,
        leaseExpiresAt: lease.expiresAt,
      },
      binding,
      url,
      { ...body, leaseExpiresAt: lease.expiresAt },
      validate,
    );
    if (evidence)
      await resource.fetch("https://factory.internal/release", {
        method: "POST",
        body: JSON.stringify({ owner: id }),
      });
    return evidence;
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
      to === "Archived" ||
      to === "Published" ||
      (to === "Ready" && state.version !== 2)
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
            "INSERT OR IGNORE INTO approvals(id,product_id,action,priority,risk) VALUES (?,?,'Approve verified release package','Medium','Low')",
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
    if (state.stage === "Published" && state.package && state.publication) {
      const release = state.package;
      statements.push(
        db
          .prepare(
            "INSERT INTO marketplace_creators(id,slug,name,bio) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(
            release.creator.id,
            release.creator.slug,
            release.creator.name,
            release.creator.bio,
          ),
        db
          .prepare(
            "INSERT INTO marketplace_releases(id,product_id,slug,title,summary,type,creator_id,price_minor,currency,artifact,digest,download_ref) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(
            state.id,
            state.productId,
            release.slug,
            release.title,
            release.summary,
            release.type,
            release.creator.id,
            release.priceMinor,
            release.currency,
            release.artifact,
            release.digest,
            state.publication.downloadReference,
          ),
        db
          .prepare(
            "INSERT OR IGNORE INTO deployments(id,product_id,environment,status) VALUES (?,?,'marketplace','succeeded')",
          )
          .bind(`${state.id}:Publish`, state.productId),
      );
    }
    if (
      state.version === 2 &&
      state.stage === "Archived" &&
      state.decision?.status === "rejected" &&
      state.build &&
      state.packageDigest &&
      state.approvalId
    ) {
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO compensation_jobs(id,product_id,run_id,approval_id,status,plan) VALUES (?,?,?,?,'queued',?)",
          )
          .bind(
            `${state.id}:Compensate`,
            state.productId,
            state.id,
            state.approvalId,
            JSON.stringify({
              buildArtifact: state.build.artifact,
              buildDigest: state.build.digest,
              packageDigest: state.packageDigest,
            }),
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
      const capacity = executionCapacity(this.env.ICVS_EXECUTION_SLOTS);
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
