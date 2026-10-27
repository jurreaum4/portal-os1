import { env, SELF, applyD1Migrations, reset } from "cloudflare:test";
import { beforeEach, describe, it, expect } from "vitest";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import type {
  AutomationProject,
  AutomationSummary,
} from "../../automation-contract";
import { runAutomation } from "../src/automation/engine";
import worker from "../src/index";
import type { Env } from "../src/types";
const bindings = env as unknown as Env & {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const integration = {
  Authorization: "Bearer synthetic-observation-token",
  "Content-Type": "application/json",
};
const governor = {
  Authorization: "Bearer synthetic-test-token",
  "Content-Type": "application/json",
};
const get = (path: string) => SELF.fetch(`https://portal.test${path}`);
const post = (
  path: string,
  body: unknown = {},
  headers: HeadersInit = integration,
) =>
  SELF.fetch(`https://portal.test${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
const input = (key = "test-idea") => ({
  submissionKey: key,
  title: "User-supplied accessibility tool",
  problem: "Users need accessible content export",
  audience: "Content editors",
  requirements: ["Export a portable document", "Provide keyboard navigation"],
  successMetrics: [{ name: "Successful exports", target: 99, unit: "percent" }],
  dependencies: [],
  platformTargets: ["web"],
  runtimeRequirements: ["Browser with JavaScript"],
  impact: 90,
  confidence: 90,
  effort: 20,
  risk: 10,
  source: "integration-test",
  unitId: "games",
});
async function submit(key = "test-idea", extra: Record<string, unknown> = {}) {
  const response = await post("/api/ideas", { ...input(key), ...extra });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    id: string;
    state: string;
    productId: string;
    score: number;
  };
}
async function detail(productId: string) {
  return (await (
    await get(`/api/automation/projects/${productId}`)
  ).json()) as AutomationProject;
}
async function job(productId: string, stage: string) {
  const d = await detail(productId);
  const j = d.jobs.find(
    (j) => j.stage === stage && j.generation === d.workflow.generation,
  );
  expect(j).toBeDefined();
  return j!;
}
async function claim(id: string) {
  const r = await post(`/api/automation/jobs/${id}/claim`, {
    workerId: "test-worker",
  });
  expect(r.status).toBe(200);
  return (await r.json()) as {
    lease_token: string;
    id: string;
    priorWork: unknown[];
    artifacts: unknown[];
  };
}
function evidence(leaseToken: string, extra: Record<string, unknown> = {}) {
  return {
    workerId: "test-worker",
    leaseToken,
    outcome: "succeeded",
    summary: "Integration executor verified the output",
    evidenceUrl: "https://artifacts.example.test/report",
    sha256: "a".repeat(64),
    buildSha256: "a".repeat(64),
    ...extra,
  };
}
async function finish(
  productId: string,
  stage: string,
  extra: Record<string, unknown> = {},
) {
  const j = await job(productId, stage);
  const c = await claim(j.id);
  const r = await post(
    `/api/automation/jobs/${j.id}/complete`,
    evidence(c.lease_token, extra),
  );
  expect(r.status).toBe(200);
}
async function decide(productId: string, action = "approve") {
  const approvals = (await (await get("/api/approvals")).json()) as {
    id: string;
    productId: string;
  }[];
  const a = approvals.find((a) => a.productId === productId);
  expect(a).toBeDefined();
  const response = await post(
    `/api/approvals/${a!.id}/${action}`,
    { reason: "Governor accepts the documented exception" },
    governor,
  );
  expect(response.status).toBe(200);
}
beforeEach(async () => {
  await reset();
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});
describe("ICVS automation lifecycle", () => {
  it("qualifies intake, generates source-based artifacts and stops at a genuine build backlog", async () => {
    const idea = await submit();
    expect(idea.state).toBe("Qualified");
    expect(idea.score).toBe(88);
    const d = await detail(idea.productId);
    expect(d.workflow).toMatchObject({
      stage: "Build",
      status: "active",
      generation: 1,
    });
    expect(d.artifacts.map((a) => a.kind).sort()).toEqual([
      "architecture",
      "discovery",
      "simulation",
      "specification",
    ]);
    expect(
      d.artifacts.find((a) => a.kind === "specification")?.content,
    ).toMatchObject({
      requirements: input().requirements,
      successMetrics: input().successMetrics,
      riskRating: "Low",
    });
    expect(
      d.artifacts.find((a) => a.kind === "architecture")?.content,
    ).toMatchObject({ platformTargets: ["web"], dependencies: [] });
    expect(
      d.artifacts.find((a) => a.kind === "simulation")?.content,
    ).toMatchObject({
      complexityScore: 20,
      riskScore: 12,
      forecastScore: 88,
      successProbability: 0.88,
    });
    expect(d.jobs.find((j) => j.stage === "Build")?.status).toBe("queued");
    const health = (await (await get("/api/system-health")).json()) as {
      checks: { name: string; status: string; detail: string }[];
    };
    expect(health.checks.find((c) => c.name === "Queue")).toMatchObject({
      status: "observed",
    });
    expect(health.checks.find((c) => c.name === "Queue")?.detail).toContain(
      "1 queued",
    );

    const signals = (await (await get("/api/console")).json()) as {
      forecasts: { productId: string; forecast: string }[];
      recommendations: { productId: string; reason: string }[];
    };
    expect(
      signals.forecasts.find((f) => f.productId === idea.productId)?.forecast,
    ).toContain("heuristic");
    expect(
      signals.recommendations.find((r) => r.productId === idea.productId)
        ?.reason,
    ).toContain("BUILD executes");

    expect(await (await get("/api/approvals")).json()).toEqual([]);
    expect(
      d.events.filter((e) => e.kind === "workflow").map((e) => e.to_state),
    ).toEqual([
      "Build",
      "Simulation",
      "Architecture",
      "Specification",
      "Discovery",
      "Idea",
    ]);
    await runAutomation(bindings.DB, idea.productId);
    expect((await detail(idea.productId)).artifacts).toHaveLength(4);
  });
  it("rejects poor intake and validates idempotent submissions without duplicate projects", async () => {
    const low = await submit("low", {
      impact: 0,
      confidence: 0,
      effort: 100,
      risk: 100,
    });
    expect(low).toMatchObject({ state: "Rejected", score: 0, productId: null });
    const idea = await submit("same");
    expect((await post("/api/ideas", input("same"))).status).toBe(200);
    expect(
      (await post("/api/ideas", { ...input("same"), title: "Different" }))
        .status,
    ).toBe(409);
    expect(
      (await post("/api/ideas", { ...input("bad"), successMetrics: [] }))
        .status,
    ).toBe(400);
    expect(
      (await post("/api/ideas", input("unauthorised"), governor)).status,
    ).toBe(401);
    expect(
      (await bindings.DB.prepare("SELECT * FROM automation_workflows").all())
        .results,
    ).toHaveLength(1);
    expect((await detail(idea.productId)).workflow.stage).toBe("Build");
  });
  it("advances Build → QA → Ready automatically but cannot publish without approval and evidence", async () => {
    const idea = await submit();
    await finish(idea.productId, "Build");
    expect((await detail(idea.productId)).workflow.stage).toBe("QA");
    const qa = await job(idea.productId, "QA");
    const claimed = await claim(qa.id);
    expect(claimed.priorWork.length).toBeGreaterThan(0);
    expect(
      (
        await post(
          `/api/automation/jobs/${qa.id}/complete`,
          evidence(claimed.lease_token, { totalTests: 4, passedTests: 3 }),
        )
      ).status,
    ).toBe(400);
    expect((await detail(idea.productId)).workflow.stage).toBe("QA");
    expect(
      (
        await post(
          `/api/automation/jobs/${qa.id}/complete`,
          evidence(claimed.lease_token, { totalTests: 4, passedTests: 4 }),
        )
      ).status,
    ).toBe(200);
    expect((await detail(idea.productId)).workflow).toMatchObject({
      stage: "Ready",
      status: "awaiting_governor",
    });
    expect(
      (await detail(idea.productId)).jobs.some((j) => j.stage === "Publish"),
    ).toBe(false);
    await decide(idea.productId);
    expect((await detail(idea.productId)).workflow.stage).toBe("Ready");
    await finish(idea.productId, "Publish");
    expect((await detail(idea.productId)).workflow.stage).toBe("Published");
    await finish(idea.productId, "Growth");
    expect((await detail(idea.productId)).workflow.status).toBe("complete");
    await post("/api/telemetry", {
      kind: "product",
      productId: idea.productId,
      health: 30,
      source: "post-publication-monitor",
      observedAt: new Date(Date.now() - 1000).toISOString(),
    });
    await worker.scheduled({} as ScheduledController, bindings);
    const postPublication = (await (
      await get("/api/automation")
    ).json()) as AutomationSummary;
    expect(
      postPublication.promotions.find((p) => p.product_id === idea.productId)
        ?.classification,
    ).toBe("Improve");

    expect(
      await bindings.DB.prepare("SELECT stage FROM products WHERE id=?")
        .bind(idea.productId)
        .first("stage"),
    ).toBe("Live");
  });
  it("routes high simulation risk through existing governor actions and cannot override evidence gates", async () => {
    const idea = await submit("risky", {
      impact: 100,
      confidence: 40,
      effort: 70,
      risk: 100,
      dependencies: Array.from({ length: 10 }, (_, i) => `dependency-${i}`),
    });
    expect((await detail(idea.productId)).workflow).toMatchObject({
      stage: "Build",
      status: "awaiting_governor",
    });
    await decide(idea.productId, "override");
    expect((await job(idea.productId, "Build")).status).toBe("queued");
    expect((await detail(idea.productId)).workflow.stage).toBe("Build");
    const d = await detail(idea.productId);
    expect(d.events.some((e) => e.action === "override")).toBe(true);
  });
  it("enforces department capacity and fences concurrent claims and stale callbacks", async () => {
    const one = await submit("one");
    const two = await submit("two");
    const j1 = await job(one.productId, "Build");
    const j2 = await job(two.productId, "Build");
    const responses = await Promise.all(
      [j1, j1, j2].map((j) =>
        post(`/api/automation/jobs/${j.id}/claim`, { workerId: "test-worker" }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    const winner = responses.findIndex((r) => r.status === 200);
    const claimed = (await responses[winner].json()) as { lease_token: string };
    const claimedJob = winner === 2 ? j2 : j1;
    await bindings.DB.prepare(
      "UPDATE automation_jobs SET lease_until='2020-01-01T00:00:00.000Z' WHERE id=?",
    )
      .bind(claimedJob.id)
      .run();
    expect(
      (
        await post(
          `/api/automation/jobs/${claimedJob.id}/complete`,
          evidence(claimed.lease_token),
        )
      ).status,
    ).toBe(409);
    await runAutomation(bindings.DB);
    const again = await claim(claimedJob.id);
    expect(again.lease_token).not.toBe(claimed.lease_token);
    expect(
      (
        await post(
          `/api/automation/jobs/${claimedJob.id}/complete`,
          evidence(claimed.lease_token),
        )
      ).status,
    ).toBe(409);
  });
  it("retries expired leases three times then requests governor intervention; rejection pauses work", async () => {
    const idea = await submit();
    const j = await job(idea.productId, "Build");
    for (let i = 0; i < 3; i++) {
      await claim(j.id);
      await bindings.DB.prepare(
        "UPDATE automation_jobs SET lease_until='2020-01-01T00:00:00.000Z' WHERE id=?",
      )
        .bind(j.id)
        .run();
      await runAutomation(bindings.DB);
    }
    expect((await detail(idea.productId)).workflow.status).toBe(
      "awaiting_governor",
    );
    await decide(idea.productId, "reject");
    expect((await detail(idea.productId)).workflow.status).toBe("paused");
    expect(
      (
        await post(`/api/automation/jobs/${j.id}/claim`, {
          workerId: "test-worker",
        })
      ).status,
    ).toBe(409);
  });
  it("records failures, supports an approved retry and never treats a failed build as success", async () => {
    const idea = await submit();
    const j = await job(idea.productId, "Build");
    const c = await claim(j.id);
    expect(
      (
        await post(
          `/api/automation/jobs/${j.id}/complete`,
          evidence(c.lease_token, {
            outcome: "failed",
            summary: "Build compilation failed",
          }),
        )
      ).status,
    ).toBe(200);
    expect((await detail(idea.productId)).workflow.stage).toBe("Build");
    await decide(idea.productId);
    await finish(idea.productId, "Build");
    expect((await detail(idea.productId)).workflow.stage).toBe("QA");
    expect(
      (await detail(idea.productId)).events.some((e) =>
        e.details.includes("Build compilation failed"),
      ),
    ).toBe(true);
  });
  it("reverses with a new generation and invalidates old leased work while retaining artifacts", async () => {
    const idea = await submit();
    const j = await job(idea.productId, "Build");
    const c = await claim(j.id);
    const before = await detail(idea.productId);
    expect(
      (
        await post(`/api/automation/projects/${idea.productId}/reversal`, {
          targetStage: "Specification",
          expectedVersion: before.workflow.version,
          reason: "Revisit the product requirements",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(
          `/api/automation/jobs/${j.id}/complete`,
          evidence(c.lease_token),
        )
      ).status,
    ).toBe(409);
    await decide(idea.productId);
    const after = await detail(idea.productId);
    expect(after.workflow).toMatchObject({ generation: 2, stage: "Build" });
    expect(after.artifacts).toHaveLength(8);
    expect(after.jobs.find((row) => row.id === j.id)?.status).toBe("cancelled");
    expect(after.events.some((e) => e.action === "reversed")).toBe(true);
    expect(
      (
        await post(
          `/api/automation/jobs/${j.id}/complete`,
          evidence(c.lease_token),
        )
      ).status,
    ).toBe(409);
  });
  it("requires compensation evidence before reversing a published lifecycle", async () => {
    const idea = await submit();
    await finish(idea.productId, "Build");
    await finish(idea.productId, "QA", { totalTests: 2, passedTests: 2 });
    await decide(idea.productId);
    await finish(idea.productId, "Publish");
    const d = await detail(idea.productId);
    expect(
      (
        await post(`/api/automation/projects/${idea.productId}/reversal`, {
          targetStage: "QA",
          expectedVersion: d.workflow.version,
          reason: "Undo publication before reassessing QA",
        })
      ).status,
    ).toBe(201);
    await decide(idea.productId);
    expect((await detail(idea.productId)).workflow).toMatchObject({
      generation: 1,
      stage: "Published",
    });
    await finish(idea.productId, "Compensate");
    expect((await detail(idea.productId)).workflow).toMatchObject({
      generation: 2,
      stage: "QA",
    });
    expect((await job(idea.productId, "Build")).status).toBe("succeeded");
    expect((await job(idea.productId, "QA")).status).toBe("queued");
  });
  it("rolls back artifact/transition writes together when persistence fails and protects audit history", async () => {
    await post("/api/automation/resources", {
      department: "STRAT",
      capacity: 0,
    });
    const idea = await submit();
    expect((await detail(idea.productId)).workflow.stage).toBe("Discovery");
    await bindings.DB.prepare(
      "CREATE TRIGGER fail_artifact BEFORE INSERT ON automation_artifacts BEGIN SELECT RAISE(ABORT,'injected storage failure'); END",
    ).run();
    expect(
      (
        await post("/api/automation/resources", {
          department: "STRAT",
          capacity: 1,
        })
      ).status,
    ).toBe(200);
    const d = await detail(idea.productId);
    expect(d.workflow.stage).toBe("Discovery");
    expect(d.artifacts).toEqual([]);
    expect(d.events.some((e) => e.to_state === "Specification")).toBe(false);
    await expect(
      bindings.DB.prepare("DELETE FROM automation_events").run(),
    ).rejects.toThrow();
    await expect(
      bindings.DB.prepare(
        "UPDATE automation_events SET action='tampered'",
      ).run(),
    ).rejects.toThrow();
  });
  it("renews live leases and rejects invalid worker identity, result provenance and oversized bodies", async () => {
    const idea = await submit();
    const build = await job(idea.productId, "Build");
    const c = await claim(build.id);
    expect(
      (
        await post(`/api/automation/jobs/${build.id}/heartbeat`, {
          workerId: "test-worker",
          leaseToken: c.lease_token,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(`/api/automation/jobs/${build.id}/heartbeat`, {
          workerId: "different-worker",
          leaseToken: c.lease_token,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(
          `/api/automation/jobs/${build.id}/complete`,
          evidence(c.lease_token, { evidenceUrl: "http://insecure.test" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          `/api/automation/jobs/${build.id}/complete`,
          evidence(c.lease_token),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await post(
          `/api/automation/jobs/${build.id}/complete`,
          evidence(c.lease_token),
        )
      ).status,
    ).toBe(409);
    const qa = await job(idea.productId, "QA");
    const qc = await claim(qa.id);
    expect(
      (
        await post(
          `/api/automation/jobs/${qa.id}/complete`,
          evidence(qc.lease_token, {
            totalTests: 1,
            passedTests: 1,
            buildSha256: "b".repeat(64),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post("/api/ideas", {
          ...input("large"),
          problem: "a".repeat(34000),
        })
      ).status,
    ).toBe(413);
    const view = await (
      await get(`/api/automation/projects/${idea.productId}`)
    ).text();
    expect(view).not.toContain(qc.lease_token);
  });
  it("classifies lifecycle opportunities with real observations and prevents telemetry jumping workflow gates", async () => {
    const idea = await submit();
    await finish(idea.productId, "Build");
    await finish(idea.productId, "QA", { totalTests: 1, passedTests: 1 });
    const observedAt = new Date(Date.now() - 1000).toISOString();
    expect(
      (
        await post("/api/telemetry", {
          kind: "product",
          productId: idea.productId,
          workflowStage: "Published",
          status: "complete",
          health: 90,
          source: "actual-test-observation",
          observedAt,
        })
      ).status,
    ).toBe(200);
    await runAutomation(bindings.DB, idea.productId);
    const consoleData = (await (await get("/api/console")).json()) as {
      products: { factoryStage: string }[];
    };
    expect(consoleData.products[0].factoryStage).toBe("Ready");
    let summary = (await (
      await get("/api/automation")
    ).json()) as AutomationSummary;
    expect(summary.promotions[0].classification).toBe("Promote");
    expect(summary.resources.find((r) => r.department === "GOV")?.backlog).toBe(
      1,
    );
    await bindings.DB.prepare(
      "UPDATE product_observations SET health=30 WHERE product_id=?",
    )
      .bind(idea.productId)
      .run();
    await runAutomation(bindings.DB, idea.productId);
    summary = (await (
      await get("/api/automation")
    ).json()) as AutomationSummary;
    expect(summary.promotions[0].classification).toBe("Improve");
    await bindings.DB.prepare(
      "UPDATE product_observations SET observed_at='2020-01-01T00:00:00.000Z' WHERE product_id=?",
    )
      .bind(idea.productId)
      .run();
    await runAutomation(bindings.DB, idea.productId);
    summary = (await (
      await get("/api/automation")
    ).json()) as AutomationSummary;
    expect(summary.promotions[0].classification).toBe("Maintain");
    await decide(idea.productId, "reject");
    summary = (await (
      await get("/api/automation")
    ).json()) as AutomationSummary;
    expect(summary.promotions[0].classification).toBe("Archive");
  });
  it("scheduled runs recover progression and concurrent runners do not duplicate planning", async () => {
    await post("/api/automation/resources", {
      department: "STRAT",
      capacity: 0,
    });
    const idea = await submit();
    await bindings.DB.prepare(
      "UPDATE automation_resources SET capacity=1 WHERE department='STRAT'",
    ).run();
    await Promise.all([
      runAutomation(bindings.DB),
      worker.scheduled({} as ScheduledController, bindings),
    ]);
    const d = await detail(idea.productId);
    expect(d.workflow.stage).toBe("Build");
    expect(d.artifacts).toHaveLength(4);
    const summary = (await (
      await get("/api/automation")
    ).json()) as AutomationSummary;
    expect(
      summary.resources.find((r) => r.department === "BUILD"),
    ).toMatchObject({ capacity: 1, workload: 0, backlog: 1 });
  });
});
