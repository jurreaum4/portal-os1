import { env, SELF, applyD1Migrations, reset } from "cloudflare:test";
import { beforeEach, describe, it, expect } from "vitest";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import type { ConsoleSnapshot, SystemHealth } from "../../console-contract";
import worker from "../src/index";
import type { Env } from "../src/types";
const bindings = env as unknown as Env & {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const get = (path: string, init?: RequestInit) =>
  SELF.fetch(`https://portal.test${path}`, init);
const governor = { Authorization: "Bearer synthetic-test-token" };
const integration = {
  Authorization: "Bearer synthetic-observation-token",
  "Content-Type": "application/json",
};
const observe = (body: unknown, headers: HeadersInit = integration) =>
  get("/api/telemetry", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
beforeEach(async () => {
  await reset();
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});
describe("Governor Console observations and governance", () => {
  it("upgrades populated legacy tables without altering products or prior decisions", async () => {
    await reset();
    await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS.slice(0, 2));
    await bindings.DB.prepare(
      "INSERT INTO products(id,name,stage,score) VALUES ('legacy','Existing product','Live',91)",
    ).run();
    await bindings.DB.prepare(
      "INSERT INTO approvals(id,product_id,action,priority,risk,status) VALUES ('legacy','legacy','Existing decision','Low','Low','approved')",
    ).run();
    await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
    expect(
      await bindings.DB.prepare(
        "SELECT stage,score FROM products WHERE id='legacy'",
      ).first(),
    ).toEqual({ stage: "Live", score: 91 });
    expect(
      await bindings.DB.prepare(
        "SELECT status FROM approvals WHERE id='legacy'",
      ).first("status"),
    ).toBe("approved");
    expect(
      (await bindings.DB.prepare("SELECT * FROM governor_decisions").all())
        .results,
    ).toEqual([]);
  });
  it("reports empty data honestly and preserves configured divisions and stages", async () => {
    const data = (await (await get("/api/console")).json()) as ConsoleSnapshot;
    expect(data.products).toEqual([]);
    expect(data.portfolioHealth).toBeNull();
    expect(data.portfolioScore).toBeNull();
    expect(data.revenue).toEqual([]);
    expect(data.forecasts).toEqual([]);
    expect(data.units.map((u) => u.name).sort()).toEqual([
      "MAX Art",
      "MAX Games",
      "MAX Institute",
      "MAX Media",
      "Quantum XR",
    ]);
    expect(data.pipeline.map((p) => p.stage)).toEqual([
      "Idea",
      "Discovery",
      "Specification",
      "Architecture",
      "Simulation",
      "Build",
      "Test",
      "Package",
      "Ready",
      "Published",
    ]);
    expect(data.departments).toHaveLength(8);
    expect(data.departments.find((d) => d.department === "GOV")?.queue).toBe(0);
    expect(
      data.departments.find((d) => d.department === "BUILD"),
    ).toMatchObject({ health: null, status: "Not reported", queue: null });
  });
  it("accepts authenticated producer observations and projects revenue, forecasts, alerts and ranking", async () => {
    await bindings.DB.prepare(
      "INSERT INTO products(id,name,stage,score,unit_id) VALUES ('c1','Factory One','Build',92,'games'),('c2','Factory Two','Validation',60,'media'),('c3','Legacy Ready','Ready',80,NULL)",
    ).run();
    const observedAt = new Date(Date.now() - 1000).toISOString();
    expect(
      (
        await observe({
          kind: "product",
          productId: "c1",
          workflowStage: "Simulation",
          status: "blocked",
          health: 30,
          revenueMinor: 12345,
          currency: "GBP",
          revenuePeriod: "2026-10",
          forecast: "Build expected after simulation review",
          forecastDueAt: "2026-11-01",
          source: "pipeline-producer",
          observedAt,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await observe({
          kind: "department",
          department: "ARCH",
          status: "running",
          health: 95,
          queue: 2,
          currentWork: "Review simulation",
          kpiName: "Reviews completed",
          kpiValue: "12",
          source: "architecture-producer",
          observedAt,
        })
      ).status,
    ).toBe(200);
    const data = (await (await get("/api/console")).json()) as ConsoleSnapshot;
    expect(data.products.map((p) => p.id)).toEqual(["c1", "c3", "c2"]);
    expect(data.portfolioScore).toBe(77);
    expect(data.portfolioHealth).toBe(30);
    expect(data.healthCoverage).toBe(1);
    expect(data.revenue).toEqual([
      { currency: "GBP", period: "2026-10", minor: 12345, coverage: 1 },
    ]);
    expect(
      data.pipeline
        .find((p) => p.stage === "Simulation")
        ?.products.map((p) => p.id),
    ).toEqual(["c1"]);
    expect(data.unclassified.map((p) => p.id)).toEqual(["c2"]);
    expect(data.forecasts[0]).toMatchObject({
      source: "pipeline-producer",
      stale: false,
    });
    expect(data.recommendations.map((r) => r.productId)).toEqual(["c1", "c3"]);
    expect(data.alerts).toHaveLength(1);
    expect(data.departments.find((d) => d.department === "ARCH")).toMatchObject(
      { health: 95, queue: 2, currentWork: "Review simulation", stale: false },
    );
  });
  it("keeps currency and period totals separate and excludes stale health and revenue", async () => {
    const now = new Date(Date.now() - 1000).toISOString();
    for (const [id, currency, period, observedAt] of [
      ["m1", "GBP", "October", now],
      ["m2", "USD", "October", now],
      ["m3", "GBP", "September", now],
      ["m4", "GBP", "October", "2020-01-01T00:00:00.000Z"],
    ]) {
      await bindings.DB.prepare(
        "INSERT INTO products(id,name,stage) VALUES (?, ?, ?)",
      )
        .bind(id, id, "Build")
        .run();
      expect(
        (
          await observe({
            kind: "product",
            productId: id,
            health: 50,
            revenueMinor: 1000,
            currency,
            revenuePeriod: period,
            forecast: "Reported outlook",
            source: "finance",
            observedAt,
          })
        ).status,
      ).toBe(200);
    }
    const data = (await (await get("/api/console")).json()) as ConsoleSnapshot;
    expect(data.revenue).toHaveLength(3);
    expect(data.revenue.every((r) => r.minor === 1000)).toBe(true);
    expect(data.healthCoverage).toBe(3);
    expect(data.forecasts.find((f) => f.productId === "m4")?.stale).toBe(true);
  });
  it("does not recommend action from a stale explicit workflow stage", async () => {
    await bindings.DB.prepare(
      "INSERT INTO products(id,name,stage,score) VALUES ('stale','Stale workflow','Ready',99)",
    ).run();
    await observe({
      kind: "product",
      productId: "stale",
      workflowStage: "Ready",
      source: "producer",
      observedAt: "2020-01-01T00:00:00.000Z",
    });
    const data = (await (await get("/api/console")).json()) as ConsoleSnapshot;
    expect(data.recommendations).toEqual([]);
    expect(data.products[0]).toMatchObject({
      factoryStage: "Ready",
      stale: true,
    });
  });
  it("fails closed on ingestion and prevents old observations overwriting current data", async () => {
    await bindings.DB.prepare(
      "INSERT INTO products(id,name,stage) VALUES ('o1','Observed','Idea')",
    ).run();
    const body = {
      kind: "product",
      productId: "o1",
      workflowStage: "Discovery",
      source: "producer",
      observedAt: new Date(Date.now() - 1000).toISOString(),
    };
    expect((await observe(body, governor)).status).toBe(401);
    expect((await observe(body, {})).status).toBe(401);
    expect((await observe({ ...body, health: 101 })).status).toBe(400);
    expect((await observe({ ...body, revenueMinor: 100 })).status).toBe(400);
    expect(
      (await observe({ ...body, observedAt: "2099-01-01T00:00:00.000Z" }))
        .status,
    ).toBe(400);
    expect((await observe({ ...body, workflowStage: "Made up" })).status).toBe(
      400,
    );
    expect((await observe({ ...body, source: "x".repeat(17000) })).status).toBe(
      413,
    );
    expect((await observe({ ...body, productId: "absent" })).status).toBe(404);
    expect((await observe(body)).status).toBe(200);
    expect(
      (
        await observe({
          ...body,
          workflowStage: "Idea",
          observedAt: "2020-01-01T00:00:00.000Z",
        })
      ).status,
    ).toBe(409);
    expect(
      await bindings.DB.prepare(
        "SELECT workflow_stage FROM product_observations WHERE product_id='o1'",
      ).first("workflow_stage"),
    ).toBe("Discovery");
    const unavailable = await worker.fetch(
      new Request("https://portal.test/api/telemetry", {
        method: "POST",
        body: "{}",
      }),
      { ...bindings, OBSERVATION_API_TOKEN: undefined },
      {} as ExecutionContext,
    );
    expect(unavailable.status).toBe(503);
  });
  it("authenticates governor and records exactly one audited pending-only override", async () => {
    expect(
      (await get("/api/session", { method: "POST", headers: governor })).status,
    ).toBe(200);
    expect(
      (await get("/api/session", { method: "POST", headers: integration }))
        .status,
    ).toBe(401);
    await bindings.DB.prepare(
      "INSERT INTO products(id,name,stage) VALUES ('g1','Governed','Ready')",
    ).run();
    await bindings.DB.prepare(
      "INSERT INTO approvals(id,product_id,action,priority,risk) VALUES ('g1','g1','Publish','High','High')",
    ).run();
    expect(
      (
        await get("/api/approvals/g1/override", {
          method: "POST",
          headers: governor,
          body: JSON.stringify({ reason: "short" }),
        })
      ).status,
    ).toBe(400);
    const reason = "Governor accepts the documented exception";
    const results = await Promise.all(
      ["override", "approve"].map((action) =>
        get(`/api/approvals/g1/${action}`, {
          method: "POST",
          headers: governor,
          body: JSON.stringify({ reason }),
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const ledger = await bindings.DB.prepare(
      "SELECT * FROM governor_decisions WHERE approval_id='g1'",
    ).all();
    expect(ledger.results).toHaveLength(1);
    expect(ledger.results[0].action).toBe(
      results[0].status === 200 ? "override" : "approve",
    );
    if (results[0].status === 200)
      expect(ledger.results[0].reason).toBe(reason);
    expect(
      await bindings.DB.prepare(
        "SELECT stage FROM products WHERE id='g1'",
      ).first("stage"),
    ).toBe("Ready");
    await expect(
      bindings.DB.prepare(
        "DELETE FROM governor_decisions WHERE approval_id='g1'",
      ).run(),
    ).rejects.toThrow();
    await expect(
      bindings.DB.prepare(
        "UPDATE governor_decisions SET action='reject' WHERE approval_id='g1'",
      ).run(),
    ).rejects.toThrow();
    expect((await get("/api/decisions")).status).toBe(401);
    expect(
      await (await get("/api/decisions", { headers: governor })).json(),
    ).toHaveLength(1);
  });
  it("probes live D1 and Durable Objects without claiming unconfigured queues are healthy", async () => {
    const data = (await (
      await get("/api/system-health")
    ).json()) as SystemHealth;
    expect(data.checks.find((c) => c.name === "D1")?.status).toBe("healthy");
    expect(data.checks.find((c) => c.name === "Durable Object")?.status).toBe(
      "healthy",
    );
    expect(data.checks.find((c) => c.name === "Queue")?.status).toBe("unknown");
    const response = await worker.fetch(
      new Request("https://portal.test/api/system-health"),
      {},
      {} as ExecutionContext,
    );
    const missing = (await response.json()) as SystemHealth;
    expect(missing.checks.find((c) => c.name === "D1")?.status).toBe(
      "unavailable",
    );
    expect(
      missing.checks.find((c) => c.name === "Durable Object")?.status,
    ).toBe("unavailable");
  });
});
