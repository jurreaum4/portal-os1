import { env, SELF, applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import type { D1Migration } from "@cloudflare/vitest-plugin";

const bindings = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const origin = "http://localhost:5173";
const get = (path: string, init?: RequestInit) =>
  SELF.fetch(`https://portal.test${path}`, init);
const authorize = { Authorization: "Bearer synthetic-test-token" };
beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS.slice(0, 2));
  await bindings.DB.batch([
    bindings.DB.prepare(
      "INSERT INTO products (id,name,description,stage,score) VALUES ('legacy','Legacy product','Existing brief','Live',90)",
    ),
    bindings.DB.prepare(
      "INSERT INTO approvals (id,product_id,action,priority,risk,status) VALUES ('legacy-decision','legacy','Publish','High','Low','approved')",
    ),
  ]);
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS.slice(2));
  expect(
    await bindings.DB.prepare(
      "SELECT stage,score,division_id FROM products WHERE id='legacy'",
    ).first(),
  ).toEqual({ stage: "Live", score: 90, division_id: "max-games" });
  expect(
    await bindings.DB.prepare(
      "SELECT status FROM approvals WHERE id='legacy-decision'",
    ).first("status"),
  ).toBe("approved");
  expect(
    (await bindings.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});
beforeEach(async () => {
  await bindings.DB.batch([
    bindings.DB.prepare("DELETE FROM deployments"),
    bindings.DB.prepare("DELETE FROM factory_outputs"),
    bindings.DB.prepare("DELETE FROM factory_runs"),
    bindings.DB.prepare("DELETE FROM activity"),
    bindings.DB.prepare("DELETE FROM approvals"),
    bindings.DB.prepare("DELETE FROM products"),
    bindings.DB.prepare("DELETE FROM virtual_processes"),
  ]);
  await bindings.DB.prepare(
    "INSERT INTO products (id,name,stage,score) VALUES ('one','One','Ready',80),('two','Two','Live',90)",
  ).run();
  await bindings.DB.prepare(
    "INSERT INTO approvals (id,product_id,action,priority,risk) VALUES ('001','one','Publish','High','Low')",
  ).run();
});

describe("Worker API and D1 integration", () => {
  it("aggregates real dashboard values and reports no health sample truthfully", async () => {
    const response = await get("/api/dashboard");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projects: 2,
      activeProducts: 1,
      readyToPublish: 1,
      approvals: 1,
      health: null,
    });
    await bindings.DB.prepare(
      "INSERT INTO virtual_processes (pid,owner_id,state,last_heartbeat_epoch,context_vector) VALUES ('p1','local','READY',1,'{}'),('p2','local','PANICKED',1,'{}')",
    ).run();
    expect(
      ((await (await get("/api/dashboard")).json()) as { health: number })
        .health,
    ).toBe(50);
  });
  it("serves products, ranking, pipeline and approval join", async () => {
    expect(await (await get("/api/products")).json()).toHaveLength(2);
    expect(await (await get("/api/products/one")).json()).toMatchObject({
      id: "one",
      stage: "Ready",
      score: 80,
    });
    expect(await (await get("/api/portfolio")).json()).toMatchObject([
      { id: "two" },
      { id: "one" },
    ]);
    const pipeline = (await (await get("/api/pipeline")).json()) as {
      stage: string;
      products: unknown[];
    }[];
    expect(pipeline).toHaveLength(13);
    expect(
      pipeline.find((row) => row.stage === "Ready")?.products,
    ).toHaveLength(1);
    expect(await (await get("/api/approvals")).json()).toMatchObject([
      { id: "001", project: "One", action: "Publish" },
    ]);
    expect(await (await get("/api/analytics")).json()).toHaveLength(2);
    expect(await (await get("/api/governance")).json()).toEqual([
      { status: "pending", count: 1 },
    ]);
    expect(await (await get("/api/telemetry")).json()).toEqual([]);
  });
  it("rejects unauthorized decisions and fails closed when configuration is absent", async () => {
    expect(
      (await get("/api/approvals/001/approve", { method: "POST" })).status,
    ).toBe(401);
    expect(
      (
        await get("/api/approvals/001/approve", {
          method: "POST",
          headers: { Authorization: "Bearer wrong" },
        })
      ).status,
    ).toBe(401);
    const response = await worker.fetch(
      new Request("https://portal.test/api/approvals/001/approve", {
        method: "POST",
      }),
      { ...bindings, GOVERNOR_API_TOKEN: undefined },
      {} as ExecutionContext,
    );
    expect(response.status).toBe(503);
    expect(
      await bindings.DB.prepare(
        "SELECT status FROM approvals WHERE id = '001'",
      ).first("status"),
    ).toBe("pending");
  });
  it("allows only one concurrent decision and updates the pending count", async () => {
    const responses = await Promise.all(
      ["approve", "reject"].map((action) =>
        get(`/api/approvals/001/${action}`, {
          method: "POST",
          headers: authorize,
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(await (await get("/api/approvals")).json()).toEqual([]);
    expect(await (await get("/api/dashboard")).json()).toMatchObject({
      approvals: 0,
    });
  });
  it("persists rejection and distinguishes missing approvals", async () => {
    expect(
      await (
        await get("/api/approvals/001/reject", {
          method: "POST",
          headers: authorize,
        })
      ).json(),
    ).toEqual({ success: true, status: "rejected" });
    expect(
      await bindings.DB.prepare(
        "SELECT status FROM approvals WHERE id = '001'",
      ).first("status"),
    ).toBe("rejected");
    expect(
      (
        await get("/api/approvals/missing/approve", {
          method: "POST",
          headers: authorize,
        })
      ).status,
    ).toBe(404);
  });
  it("handles CORS preflight, errors and rejects unapproved origins", async () => {
    const preflight = await get("/api/approvals/001/approve", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Headers": "Authorization",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
    expect(
      (
        await get("/api/products", {
          headers: { Origin: "https://untrusted.test" },
        })
      ).status,
    ).toBe(403);
    const error = await get("/api/products/missing", {
      headers: { Origin: origin },
    });
    expect(error.status).toBe(404);
    expect(error.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(error.headers.get("Cache-Control")).toBe("no-store");
    expect((await get("/api/unknown")).status).toBe(404);
    expect((await get("/api/products", { method: "POST" })).status).toBe(405);
    expect((await get("/api/products/%ZZ")).status).toBe(400);
  });
  it("keeps the existing health and Durable Object IPC response contract", async () => {
    expect(await (await get("/")).json()).toMatchObject({
      status: "ONLINE",
      kernel: "Portal-OS1 Tier 1 Edge Kernel",
    });
    const envelope = {
      jsonrpc: "2.0",
      source_pid: "client_pwa_root",
      target_pid: "kernel_root",
      method: "agent.cognitive.sync",
      params: {},
    };
    const response = await get("/api/kernel/ipc", {
      method: "POST",
      body: JSON.stringify(envelope),
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "SUCCESS",
      received_envelope: envelope,
    });
  });
});

describe("Command centre operations", () => {
  it("serves divisions, runtime and intelligence from D1", async () => {
    expect(await (await get("/api/divisions")).json()).toHaveLength(4);
    expect(await (await get("/api/system-health")).json()).toMatchObject({
      status: "Operational",
      services: [
        { name: "Worker API", status: "Operational" },
        { name: "D1 database", status: "Operational" },
        { name: "Durable Objects", status: "Configured" },
        { name: "Product runtime", status: "No telemetry" },
      ],
    });
    expect(await (await get("/api/processes")).json()).toEqual([]);
    expect(await (await get("/api/deployments")).json()).toEqual([]);
    expect(await (await get("/api/runtime")).json()).toMatchObject({
      processes: [],
    });
    expect(await (await get("/api/departments")).json()).toHaveLength(8);
    expect(await (await get("/api/forecasts")).json()).toMatchObject({
      divisions: expect.arrayContaining([
        expect.objectContaining({ id: "max-games", revenue: 0, products: 2 }),
      ]),
    });
    expect(await (await get("/api/recommendations")).json()).toMatchObject([
      { productId: "one" },
    ]);
    expect(await (await get("/api/overview")).json()).toMatchObject({
      portfolioScore: 85,
      revenue: 0,
    });
  });
  it("requires authorization for every command and validates intake", async () => {
    for (const path of [
      "/api/intake",
      "/api/divisions",
      "/api/factory/one/run",
      "/api/approvals/001/override",
    ]) {
      expect((await get(path, { method: "POST" })).status).toBe(401);
    }
    const post = (body: unknown) =>
      get("/api/intake", {
        method: "POST",
        headers: { ...authorize, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await post(null)).status).toBe(400);
    expect(
      (
        await post({
          name: "Example",
          description: "A",
          divisionId: "max-games",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          name: "Example",
          description: "A sufficiently detailed product brief",
          divisionId: "missing",
        })
      ).status,
    ).toBe(400);
    expect((await get("/api/intake")).status).toBe(405);
  });
  it("creates future divisions and persists product intake", async () => {
    const created = await get("/api/divisions", {
      method: "POST",
      headers: authorize,
      body: JSON.stringify({ name: "MAX Future" }),
    });
    expect(created.status).toBe(201);
    const division = (await created.json()) as { id: string };
    const intake = await get("/api/intake", {
      method: "POST",
      headers: authorize,
      body: JSON.stringify({
        name: "Future idea",
        description: "A detailed synthetic brief for a future product",
        divisionId: division.id,
      }),
    });
    expect(intake.status).toBe(201);
    const { id } = (await intake.json()) as { id: string };
    expect(await (await get(`/api/products/${id}`)).json()).toMatchObject({
      divisionId: division.id,
      stage: "Idea",
      revenue: 0,
      status: "On track",
    });
    expect(await (await get("/api/activity")).json()).toMatchObject([
      { productId: id, department: "STRAT" },
    ]);
    expect(
      (
        await get("/api/divisions", {
          method: "POST",
          headers: authorize,
          body: JSON.stringify({ name: "MAX Future" }),
        })
      ).status,
    ).toBe(409);
    await bindings.DB.prepare("DELETE FROM activity WHERE product_id=?")
      .bind(id)
      .run();
    await bindings.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();
    await bindings.DB.prepare("DELETE FROM divisions WHERE id=?")
      .bind(division.id)
      .run();
  });
  it("requires an override reason, preserves finality and exposes history", async () => {
    const post = (body: unknown) =>
      get("/api/approvals/001/override", {
        method: "POST",
        headers: authorize,
        body: JSON.stringify(body),
      });
    expect((await post({ reason: "short" })).status).toBe(400);
    expect(
      (await post({ reason: "Governor accepts the documented exception." }))
        .status,
    ).toBe(200);
    expect(
      (
        await post({
          reason: "A repeated exception cannot change a final decision.",
        })
      ).status,
    ).toBe(409);
    expect(await (await get("/api/decisions")).json()).toMatchObject([
      {
        status: "overridden",
        note: "Governor accepts the documented exception.",
      },
    ]);
    expect(await (await get("/api/products/one")).json()).toMatchObject({
      stage: "Ready",
    });
  });
  it("serializes factory planning, persists outputs, and stops before external execution", async () => {
    await bindings.DB.prepare(
      "UPDATE products SET stage='Idea',description='A synthetic product brief with concrete goals for planning' WHERE id='one'",
    ).run();
    const post = () =>
      get("/api/factory/one/run", { method: "POST", headers: authorize });
    const responses = await Promise.all([post(), post()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await (await get("/api/factory")).json()).toMatchObject([
      { productId: "one", status: "blocked", stage: "Build" },
    ]);
    const outputs = (await (await get("/api/factory/one/outputs")).json()) as {
      engine: string;
      content: string;
    }[];
    expect(outputs.map((o) => o.engine)).toEqual([
      "Intake",
      "Specification",
      "Architecture",
      "Simulation",
    ]);
    expect(JSON.parse(outputs[3].content)).toMatchObject({
      executionSimulated: false,
    });
    expect(await (await get("/api/products/one")).json()).toMatchObject({
      stage: "Build",
    });
    expect(
      (
        await get("/api/factory/missing/run", {
          method: "POST",
          headers: authorize,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await get("/api/factory/two/run", {
          method: "POST",
          headers: authorize,
        })
      ).status,
    ).toBe(409);
  });
});
