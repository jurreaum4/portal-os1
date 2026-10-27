import { simulationEngine } from "../src/icvs/engines";
import {
  env,
  SELF,
  applyD1Migrations,
  runInDurableObject,
} from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import type { Env } from "../src/types";
import type { Universe } from "../src/universe/model";
import { captureUniverse } from "../src/universe/graph";
import { loadDefinition } from "../src/icvs/definition";
const bindings = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const headers = (role = "viewer") => ({
  Authorization: `Bearer ${role === "governor" ? "synthetic-test-token" : `test-${role}`}`,
});
const get = (path = "/api/universe", role = "viewer") =>
  SELF.fetch(`https://portal.test${path}`, { headers: headers(role) });
const post = (body: unknown, role = "automation") =>
  SELF.fetch("https://portal.test/api/universe/events", {
    method: "POST",
    headers: headers(role),
    body: JSON.stringify(body),
  });
const event = (id: string, kind: string, data: unknown, extra = {}) => ({
  id,
  kind,
  data,
  eventId: crypto.randomUUID(),
  expectedRevision: 0,
  source: "test-provider",
  reason: "Integration test observation",
  deleted: false,
  ...extra,
});
beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});
beforeEach(async () => {
  await bindings.DB.batch(
    [
      "universe_events",
      "universe_records",
      "universe_snapshots",
      "workflow_approvals",
      "workflow_events",
      "deployments",
      "factory_outputs",
      "factory_runs",
      "activity",
      "approvals",
      "products",
    ].map((t) => bindings.DB.prepare(`DELETE FROM ${t}`)),
  );
  await bindings.DB.batch([
    bindings.DB.prepare("UPDATE workflow_definitions SET active=0"),
    bindings.DB.prepare(
      "UPDATE workflow_definitions SET active=1 WHERE id='icvs-v3'",
    ),
  ]);
  await bindings.DB.prepare(
    "INSERT INTO products(id,name,description,stage,division_id,revenue) VALUES ('graph-product','Graph product','An actual test fixture brief describing scope','Idea','max-nfl',120)",
  ).run();
});
describe("Universe security and integration", () => {
  it("enforces viewer, automation and governor separation", async () => {
    expect((await SELF.fetch("https://portal.test/api/universe")).status).toBe(
      401,
    );
    expect((await get()).status).toBe(200);
    const body = event("external:service", "entity", {
      name: "Service fixture",
      kind: "service",
    });
    expect((await post(body, "viewer")).status).toBe(403);
    expect((await post(body, "governor")).status).toBe(403);
    expect((await post(body)).status).toBe(201);
    expect(
      (
        await SELF.fetch("https://portal.test/api/approvals/unknown/approve", {
          method: "POST",
          headers: headers("automation"),
        })
      ).status,
    ).toBe(401);
  });
  it("uses existing revenue without double counting subdivisions and exposes unknown telemetry", async () => {
    const graph = (await (await get()).json()) as Universe;
    expect(graph.summary.revenue).toBe(120);
    expect(
      graph.nodes.find((n) => n.id === "division:max-sports"),
    ).toMatchObject({ revenue: 120, forecast: { baseline: 120 } });
    expect(
      graph.nodes.find((n) => n.id === "product:graph-product"),
    ).toMatchObject({ users: null, impact: null, growth: null });
    expect(graph.modules).toHaveLength(9);
    expect(
      graph.nodes.filter((n) => n.parentId === "division:max-sports"),
    ).toHaveLength(8);
    expect(
      (await bindings.DB.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
  it("serializes revisions, deduplicates retries and reverses records with retained history", async () => {
    const body = event("external:asset", "entity", {
      name: "Asset fixture",
      kind: "asset",
    });
    const responses = await Promise.all([post(body), post(body)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(
      (await post({ ...body, data: { name: "Changed", kind: "asset" } }))
        .status,
    ).toBe(409);
    expect(
      (
        await post(
          event(body.id, "entity", body.data, {
            deleted: true,
            expectedRevision: 1,
          }),
        )
      ).status,
    ).toBe(201);
    expect((await get("/api/universe/twins?id=external%3Aasset")).status).toBe(
      404,
    );
    expect(
      (await post(event(body.id, "entity", body.data, { expectedRevision: 2 })))
        .status,
    ).toBe(201);
    expect((await get("/api/universe/twins?id=external%3Aasset")).status).toBe(
      200,
    );
    const history = (await (
      await get("/api/universe/events?id=external%3Aasset")
    ).json()) as unknown[];
    expect(history).toHaveLength(3);
    expect(
      (await post(event(body.id, "entity", body.data, { expectedRevision: 0 })))
        .status,
    ).toBe(409);
  });
  it("rejects invalid timestamps, metrics, dangling links and containment cycles", async () => {
    expect(
      (
        await post(
          event("bad-link", "relationship", {
            from: "product:graph-product",
            to: "missing",
            type: "depends_on",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          event("bad-metric", "observation", {
            entityId: "product:graph-product",
            observedAt: "yesterday",
            currency: "USD",
            metrics: { users: -1 },
          }),
        )
      ).status,
    ).toBe(400);
    await post(
      event("external:a", "entity", { name: "Parent A", kind: "service" }),
    );
    await post(
      event("external:b", "entity", {
        name: "Child B",
        kind: "service",
        parentId: "external:a",
      }),
    );
    expect(
      (
        await post(
          event(
            "external:a",
            "entity",
            { name: "Parent A", kind: "service", parentId: "external:b" },
            { expectedRevision: 1 },
          ),
        )
      ).status,
    ).toBe(400);
  });
  it("propagates dependency risk and selects latest observed values over late arrivals", async () => {
    await post(
      event("external:runtime", "entity", {
        name: "Shared runtime",
        kind: "runtime",
      }),
    );
    await post(
      event("dependency", "relationship", {
        from: "product:graph-product",
        to: "external:runtime",
        type: "depends_on",
      }),
    );
    await post(
      event("health", "observation", {
        entityId: "external:runtime",
        observedAt: "2025-01-02T00:00:00Z",
        currency: "USD",
        metrics: { health: 0, users: 20 },
      }),
    );
    await post(
      event("late-health", "observation", {
        entityId: "external:runtime",
        observedAt: "2025-01-01T00:00:00Z",
        currency: "USD",
        metrics: { health: 100, users: 10 },
      }),
    );
    const graph = (await (await get()).json()) as Universe;
    expect(graph.nodes.find((n) => n.id === "external:runtime")).toMatchObject({
      health: 0,
      users: 20,
      risk: "High",
    });
    expect(
      graph.nodes.find((n) => n.id === "product:graph-product")?.risk,
    ).toBe("High");
    const spatial = (await (
      await get("/api/universe/spatial?room=products")
    ).json()) as Universe;
    expect(
      spatial.nodes.every((n) =>
        Object.values(n.position).every(Number.isFinite),
      ),
    ).toBe(true);
    expect(
      spatial.relationships.every(
        (r) =>
          spatial.nodes.some((n) => n.id === r.from) &&
          spatial.nodes.some((n) => n.id === r.to),
      ),
    ).toBe(true);
  });
  it("discovers future divisions and captures idempotent daily history", async () => {
    await bindings.DB.prepare(
      "INSERT INTO divisions(id,name,color) VALUES ('test-future','Future division','#778899')",
    ).run();
    expect(
      ((await (await get()).json()) as Universe).nodes.some(
        (n) => n.id === "division:test-future",
      ),
    ).toBe(true);
    await captureUniverse(bindings);
    await captureUniverse(bindings);
    const graph = (await (await get()).json()) as Universe;
    expect(
      graph.nodes.find((n) => n.id === "product:graph-product")?.history,
    ).toHaveLength(1);
    await bindings.DB.prepare(
      "DELETE FROM divisions WHERE id='test-future'",
    ).run();
  });
});

describe("V3 workflow", () => {
  it.each([false, true])(
    "verifies publishing evidence and pinned configuration (wrong digest: %s)",
    async (wrongDigest) => {
      const id = crypto.randomUUID();
      await bindings.DB.prepare(
        "INSERT INTO products(id,name,description,stage) VALUES (?,'Publishing fixture','A supplied brief verified by isolated executor fixtures','Idea')",
      )
        .bind(id)
        .run();
      expect(
        (
          await SELF.fetch(`https://portal.test/api/factory/${id}/run`, {
            method: "POST",
            headers: headers("governor"),
          })
        ).status,
      ).toBe(201);
      const stub = bindings.FACTORY_ACTOR!.get(
        bindings.FACTORY_ACTOR!.idFromName(id),
      );
      const advance = async () =>
        runInDurableObject(stub, async (instance: any, ctx) => {
          instance.env.ICVS_EXECUTOR = {
            fetch: async (_url: string, init: RequestInit) => {
              const b = JSON.parse(init.body as string);
              return Response.json({
                operationId: b.operationId,
                artifact: "https://fixture.invalid/artifact",
                digest: (wrongDigest && b.stage === "Published"
                  ? "b"
                  : "a"
                ).repeat(64),
                checks:
                  b.stage === "QA"
                    ? [
                        {
                          requirement: "brief",
                          passed: true,
                          report: "https://fixture.invalid/report",
                        },
                      ]
                    : [],
              });
            },
          };
          await instance.alarm();
          await ctx.storage.deleteAlarm();
        });
      await bindings.DB.batch([
        bindings.DB.prepare("UPDATE workflow_definitions SET active=0"),
        bindings.DB.prepare(
          "UPDATE workflow_definitions SET active=1 WHERE id='icvs-v2'",
        ),
      ]);
      for (let i = 0; i < 10; i++) await advance();
      const approval = await bindings.DB.prepare(
        "SELECT id FROM approvals WHERE product_id=? AND status='pending'",
      )
        .bind(id)
        .first<string>("id");
      expect(approval).not.toBeNull();
      expect(
        (
          await SELF.fetch(
            `https://portal.test/api/approvals/${approval}/approve`,
            { method: "POST", headers: headers("governor") },
          )
        ).status,
      ).toBe(200);
      await advance();
      expect(
        await bindings.DB.prepare("SELECT stage FROM products WHERE id=?")
          .bind(id)
          .first("stage"),
      ).toBe(wrongDigest ? "Ready" : "Published");
      const events = (
        await bindings.DB.prepare(
          "SELECT to_stage FROM workflow_events WHERE product_id=? ORDER BY sequence",
        )
          .bind(id)
          .all<{ to_stage: string }>()
      ).results.map((r) => r.to_stage);
      expect(events).toContain("Research");
      expect(events.at(-1)).toBe(wrongDigest ? "Ready" : "Published");
      expect(
        await bindings.DB.prepare(
          "SELECT COUNT(*) AS count FROM deployments WHERE product_id=?",
        )
          .bind(id)
          .first("count"),
      ).toBe(wrongDigest ? 0 : 1);
    },
  );
  it("rejects workflow configuration that bypasses QA", async () => {
    await bindings.DB.prepare(
      "UPDATE workflow_definitions SET definition=? WHERE id='icvs-v3'",
    )
      .bind(
        JSON.stringify({
          id: "invalid",
          steps: [
            { stage: "Idea", engine: "intake" },
            { stage: "Build", engine: "build" },
            { stage: "Ready", engine: "ready" },
            { stage: "Published", engine: "publish" },
          ],
        }),
      )
      .run();
    await expect(loadDefinition(bindings.DB)).rejects.toThrow(
      "Invalid workflow definition",
    );
  });
});

it("simulates configured stage names without a hardcoded initial stage", () => {
  const result = simulationEngine(
    {
      name: "Configurable lifecycle",
      description: "A concrete brief used to verify configured lifecycle names",
    },
    ["Proposal", "Investigation", "Ready"],
  );
  expect(result.reached).toEqual(["Proposal", "Investigation", "Ready"]);
  expect(result.passed).toBe(true);
});
