import {
  env,
  SELF,
  applyD1Migrations,
  runInDurableObject,
} from "cloudflare:test";
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
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS.slice(2, 4));
  await bindings.DB.batch([
    bindings.DB.prepare(
      "INSERT INTO factory_runs(id,product_id,status,stage) VALUES ('old-run','legacy','blocked','Build')",
    ),
    bindings.DB.prepare(
      "INSERT INTO factory_outputs(id,run_id,engine,content) VALUES ('old-output','old-run','Specification','{}')",
    ),
    bindings.DB.prepare(
      "INSERT INTO activity(id,product_id,title,department) VALUES ('old-activity','legacy','Preserved event','STRAT')",
    ),
    bindings.DB.prepare(
      "INSERT INTO deployments(id,product_id,environment,status) VALUES ('old-deployment','legacy','test','succeeded')",
    ),
  ]);
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS.slice(4, 5));
  await bindings.DB.batch([
    bindings.DB.prepare(
      "INSERT INTO workflow_events(id,run_id,product_id,sequence,to_stage,engine,actor,reason,evidence,created_at) VALUES ('old-event','old-run','legacy',1,'Build','Build','automation','Preserve history','{}','2025-01-01T00:00:00Z')",
    ),
    bindings.DB.prepare(
      "INSERT INTO workflow_approvals(approval_id,run_id) VALUES ('legacy-decision','old-run')",
    ),
  ]);
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS.slice(5));
  expect(
    await bindings.DB.prepare(
      "SELECT id FROM workflow_events WHERE id='old-event'",
    ).first("id"),
  ).toBe("old-event");
  expect(
    await bindings.DB.prepare(
      "SELECT run_id FROM workflow_approvals WHERE approval_id='legacy-decision'",
    ).first("run_id"),
  ).toBe("old-run");
  for (const table of [
    "factory_runs",
    "factory_outputs",
    "activity",
    "deployments",
  ]) {
    expect(
      await bindings.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first(
        "count",
      ),
    ).toBe(1);
  }
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
    bindings.DB.prepare("UPDATE workflow_definitions SET active=0"),
    bindings.DB.prepare(
      "UPDATE workflow_definitions SET active=1 WHERE id='icvs-v2'",
    ),
  ]);
  await bindings.DB.batch([
    bindings.DB.prepare("DELETE FROM workflow_approvals"),
    bindings.DB.prepare("DELETE FROM workflow_events"),
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
    expect(pipeline).toHaveLength(15);
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
    expect(await (await get("/api/divisions")).json()).toHaveLength(15);
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
    await runInDurableObject(
      bindings.FACTORY_ACTOR!.get(bindings.FACTORY_ACTOR!.idFromName(id)),
      async (_instance, ctx) => {
        await ctx.storage.deleteAlarm();
      },
    );
    expect(await (await get(`/api/products/${id}`)).json()).toMatchObject({
      divisionId: division.id,
      stage: expect.stringMatching(
        /^(Idea|Discovery|Specification|Architecture|Simulation|Build)$/,
      ),
      revenue: 0,
      status: "On track",
    });
    expect(await (await get("/api/activity")).json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: id, department: "STRAT" }),
      ]),
    );
    expect(
      (
        await get("/api/divisions", {
          method: "POST",
          headers: authorize,
          body: JSON.stringify({ name: "MAX Future" }),
        })
      ).status,
    ).toBe(409);
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
  it("serializes durable automation and blocks truthfully without an executor", async () => {
    const id = crypto.randomUUID();
    await bindings.DB.prepare(
      "INSERT INTO products(id,name,description,stage) VALUES (?,'Automation test','Concrete test brief describing an executable project','Idea')",
    )
      .bind(id)
      .run();
    const post = () =>
      get(`/api/factory/${id}/run`, { method: "POST", headers: authorize });
    const responses = await Promise.all([post(), post()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    const stub = bindings.FACTORY_ACTOR!.get(
      bindings.FACTORY_ACTOR!.idFromName(id),
    );
    for (let i = 0; i < 7; i++)
      await runInDurableObject(stub, async (instance: any, ctx) => {
        await instance.alarm();
        await ctx.storage.deleteAlarm();
      });
    expect(await (await get(`/api/products/${id}`)).json()).toMatchObject({
      stage: "Build",
      status: "Attention",
    });
    const transitions = (await (
      await get(`/api/factory/${id}/transitions`)
    ).json()) as { toStage: string }[];
    expect(transitions.map((t) => t.toStage)).toEqual([
      "Idea",
      "Discovery",
      "Specification",
      "Architecture",
      "Simulation",
      "Build",
      "Build",
    ]);
    expect(await (await get("/api/factory")).json()).toMatchObject([
      { productId: id, status: "blocked", stage: "Build" },
    ]);
    expect((await post()).status).toBe(200);
    await runInDurableObject(stub, async (_instance, ctx) => {
      await ctx.storage.deleteAlarm();
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

describe("ICVS execution and recovery", () => {
  async function start() {
    const id = crypto.randomUUID();
    await bindings.DB.prepare(
      "INSERT INTO products(id,name,description,stage) VALUES (?,'Executor contract test','Verify a supplied brief against an immutable build artifact','Idea')",
    )
      .bind(id)
      .run();
    await get(`/api/factory/${id}/run`, { method: "POST", headers: authorize });
    const stub = bindings.FACTORY_ACTOR!.get(
      bindings.FACTORY_ACTOR!.idFromName(id),
    );
    await runInDurableObject(stub, async (_instance, ctx) => {
      await ctx.storage.deleteAlarm();
    });
    return { id, stub };
  }
  // Test-only executor fixture; never used by application code or seeded into D1 outside tests.
  async function drive(stub: DurableObjectStub, wrongDigest = false) {
    await runInDurableObject(stub, async (instance: any, ctx) => {
      instance.env.ICVS_EXECUTOR = {
        fetch: async (_url: string, init: RequestInit) => {
          const request = JSON.parse(init.body as string);
          expect(init.headers).toMatchObject({
            "Idempotency-Key": request.operationId,
          });
          return Response.json({
            operationId: request.operationId,
            artifact: "https://test.invalid/artifact",
            digest: (wrongDigest && request.stage === "QA" ? "b" : "a").repeat(
              64,
            ),
            checks:
              request.stage === "QA"
                ? [
                    {
                      requirement: "brief",
                      passed: true,
                      report: "https://test.invalid/report",
                    },
                  ]
                : [],
          });
        },
      };
      await instance.alarm();
      await ctx.storage.deleteAlarm();
    });
  }
  for (const action of ["approve", "reject", "override"]) {
    it(`automatically verifies execution and handles ${action} with an audit trail`, async () => {
      const { id, stub } = await start();
      for (let i = 0; i < 9; i++) await drive(stub);
      const approval = await bindings.DB.prepare(
        "SELECT id FROM approvals WHERE product_id=? AND status='pending'",
      )
        .bind(id)
        .first<{ id: string }>();
      expect(approval).not.toBeNull();
      expect(await (await get(`/api/products/${id}`)).json()).toMatchObject({
        stage: "QA",
      });
      const responses = await Promise.all(
        [1, 2].map(() =>
          get(`/api/approvals/${approval!.id}/${action}`, {
            method: "POST",
            headers: authorize,
            body: JSON.stringify({
              reason: "Governor reviewed the verified evidence.",
            }),
          }),
        ),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await (await get(`/api/products/${id}`)).json()).toMatchObject({
        stage: action === "reject" ? "Archived" : "Ready",
        score: action === "reject" ? 0 : 100,
      });
      const events = (await (
        await get(`/api/factory/${id}/transitions`)
      ).json()) as any[];
      expect(events.map((e) => e.sequence)).toEqual(
        events.map((_, i) => i + 1),
      );
      expect(events.at(-1)).toMatchObject({
        actor: "governor",
        engine: action === "reject" ? "Archive" : "Promotion",
      });
      expect(
        (await bindings.DB.prepare("PRAGMA foreign_key_check").all()).results,
      ).toEqual([]);
    });
  }
  it("blocks QA for a different artifact and never creates a promotion request", async () => {
    const { id, stub } = await start();
    for (let i = 0; i < 9; i++) await drive(stub, true);
    expect(await (await get(`/api/products/${id}`)).json()).toMatchObject({
      stage: "QA",
      status: "Attention",
    });
    expect(
      await bindings.DB.prepare("SELECT id FROM approvals WHERE product_id=?")
        .bind(id)
        .first(),
    ).toBeNull();
  });
  it("replays a durable journal after D1 projection fails without duplicate events", async () => {
    const { id, stub } = await start();
    await bindings.DB.exec(
      "CREATE TRIGGER fail_icvs BEFORE INSERT ON workflow_events BEGIN SELECT RAISE(FAIL, 'test projection unavailable'); END;",
    );
    await drive(stub);
    await runInDurableObject(stub, async (_instance, ctx) => {
      expect((await ctx.storage.get<any>("workflow")).pending).toBeDefined();
    });
    await bindings.DB.exec("DROP TRIGGER fail_icvs;");
    await drive(stub);
    const events = (
      await bindings.DB.prepare(
        "SELECT sequence FROM workflow_events WHERE product_id=? ORDER BY sequence",
      )
        .bind(id)
        .all<{ sequence: number }>()
    ).results;
    expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i + 1));
    await runInDurableObject(stub, async (_instance, ctx) => {
      expect((await ctx.storage.get<any>("workflow")).pending).toBeUndefined();
    });
  });
  it("serializes portfolio resource allocation and reclaims expired leases", async () => {
    const stub = bindings.FACTORY_ACTOR!.get(
      bindings.FACTORY_ACTOR!.idFromName("allocation-test"),
    );
    const send = (path: string, owner: string) =>
      stub.fetch(`https://factory.internal/${path}`, {
        method: "POST",
        body: JSON.stringify({ owner }),
      });
    const results = await Promise.all(
      ["one", "two", "three"].map((owner) => send("allocate", owner)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 429]);
    expect((await send("allocate", "one")).status).toBe(200);
    await send("release", "one");
    expect((await send("allocate", "three")).status).toBe(200);
    await runInDurableObject(stub, async (_instance, ctx) => {
      await ctx.storage.put("leases", { expired: Date.now() - 1 });
    });
    expect((await send("allocate", "four")).status).toBe(200);
  });
});

describe("ICVS upgrade and terminal recovery", () => {
  it("adopts an existing Build handoff without duplicating the run or losing artifacts", async () => {
    const id = crypto.randomUUID();
    await bindings.DB.batch([
      bindings.DB.prepare(
        "INSERT INTO products(id,name,description,stage) VALUES (?,'Existing handoff','An existing detailed brief awaiting actual execution','Build')",
      ).bind(id),
      bindings.DB.prepare(
        "INSERT INTO factory_runs(id,product_id,status,stage) VALUES (?,?,'blocked','Build')",
      ).bind(id, id),
      bindings.DB.prepare(
        "INSERT INTO factory_outputs(id,run_id,engine,content) VALUES (?,?,'Specification','{}')",
      ).bind(id, id),
    ]);
    const response = await get(`/api/factory/${id}/run`, {
      method: "POST",
      headers: authorize,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id, stage: "Build" });
    const stub = bindings.FACTORY_ACTOR!.get(
      bindings.FACTORY_ACTOR!.idFromName(id),
    );
    await runInDurableObject(stub, async (_instance, ctx) => {
      await ctx.storage.deleteAlarm();
    });
    expect(
      await bindings.DB.prepare(
        "SELECT COUNT(*) AS count FROM factory_runs WHERE product_id=?",
      )
        .bind(id)
        .first("count"),
    ).toBe(1);
    expect(
      await bindings.DB.prepare("SELECT id FROM factory_outputs WHERE id=?")
        .bind(id)
        .first("id"),
    ).toBe(id);
  });
  it("retains the retry alarm until a terminal journal is projected", async () => {
    const id = crypto.randomUUID();
    await bindings.DB.prepare(
      "INSERT INTO products(id,name,description,stage) VALUES (?,'Terminal recovery','A detailed requirement for terminal journal recovery','Idea')",
    )
      .bind(id)
      .run();
    await get(`/api/factory/${id}/run`, { method: "POST", headers: authorize });
    const stub = bindings.FACTORY_ACTOR!.get(
      bindings.FACTORY_ACTOR!.idFromName(id),
    );
    // Inject the exact crash boundary (DO committed; terminal D1 batch not committed).
    await runInDurableObject(stub, async (_instance, ctx) => {
      await ctx.storage.deleteAlarm();
      const state = await ctx.storage.get<any>("workflow");
      state.sequence++;
      state.stage = "Archived";
      state.status = "completed";
      state.message = "Archive recovery";
      state.pending = {
        id: `${state.id}:${state.sequence}`,
        sequence: state.sequence,
        from: "Idea",
        to: "Archived",
        engine: "Archive",
        actor: "governor",
        reason: state.message,
        evidence: { deleted: false },
        at: new Date().toISOString(),
      };
      await ctx.storage.put("workflow", state);
    });
    await bindings.DB.exec(
      "CREATE TRIGGER terminal_failure BEFORE INSERT ON workflow_events BEGIN SELECT RAISE(FAIL, 'test unavailable'); END;",
    );
    await runInDurableObject(stub, async (instance: any, ctx) => {
      await instance.alarm();
      expect(await ctx.storage.getAlarm()).not.toBeNull();
      expect((await ctx.storage.get<any>("workflow")).pending).toBeDefined();
    });
    await bindings.DB.exec("DROP TRIGGER terminal_failure;");
    await runInDurableObject(stub, async (instance: any, ctx) => {
      await instance.alarm();
      expect(await ctx.storage.getAlarm()).toBeNull();
      expect((await ctx.storage.get<any>("workflow")).pending).toBeUndefined();
    });
    expect(await (await get(`/api/products/${id}`)).json()).toMatchObject({
      stage: "Archived",
    });
  });
});
