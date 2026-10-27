import {
  env,
  SELF,
  applyD1Migrations,
  runInDurableObject,
} from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import type { Env } from "../src/types";
import { marketplaceApi } from "../src/universe/marketplace";
const bindings = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const headers = { Authorization: "Bearer synthetic-test-token" };
const call = (path: string, body?: unknown, auth = headers) =>
  SELF.fetch(`https://portal.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: auth,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
beforeAll(() => applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS));
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
      "icv_principals",
    ].map((t) => bindings.DB.prepare(`DELETE FROM ${t}`)),
  );
  await bindings.DB.batch([
    bindings.DB.prepare("UPDATE workflow_definitions SET active=0"),
    bindings.DB.prepare(
      "UPDATE workflow_definitions SET active=1 WHERE id='icvs-v3-final'",
    ),
  ]);
});
async function principal(id: string, role: string, token: string) {
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  await bindings.DB.prepare(
    "INSERT INTO icv_principals(id,name,role,token_hash) VALUES (?,?,?,?)",
  )
    .bind(id, id, role, hash)
    .run();
  return { Authorization: `Bearer ${token}` };
}
it("resolves named ICV identities, rejects disabled credentials and keeps members outside Universe", async () => {
  const member = await principal("person-one", "member", "test-person-token");
  expect(
    await (await call("/api/icv/me", undefined, member)).json(),
  ).toMatchObject({ id: "person-one", role: "member" });
  expect((await call("/api/universe", undefined, member)).status).toBe(401);
  expect(
    (await call("/api/approvals/missing/approve", {}, member)).status,
  ).toBe(401);
  await bindings.DB.prepare(
    "UPDATE icv_principals SET disabled=1 WHERE id='person-one'",
  ).run();
  expect((await call("/api/icv/me", undefined, member)).status).toBe(401);
});
it("grounds BEMAX answers in live data without giving it execution authority", async () => {
  expect(
    (
      await call(
        "/api/bemax/query",
        { question: "Show me risks" },
        {} as typeof headers,
      )
    ).status,
  ).toBe(401);
  const answer = (await (
    await call("/api/bemax/query", { question: "What should be published?" })
  ).json()) as any;
  expect(answer.intent).toBe("publishing");
  expect(answer.items).toEqual([]);
  expect(answer.answer).toContain("No products");
  expect(
    (await call("/api/bemax/query", { question: "x".repeat(1001) })).status,
  ).toBe(400);
  expect(
    await bindings.DB.prepare(
      "SELECT count(*) AS n FROM workflow_events",
    ).first("n"),
  ).toBe(0);
});
it("keeps commerce owned by MAX Marketplace and derives subject from ICV", async () => {
  await bindings.DB.prepare(
    "INSERT INTO products(id,name,description,stage,division_id) VALUES ('public','Published item','A published product description','Published','max-apps'),('private','Private item','An unpublished product description','Build','max-apps')",
  ).run();
  const catalog = (await (
    await call("/api/marketplace/catalog", undefined, {} as typeof headers)
  ).json()) as any;
  expect(catalog.products.map((p: any) => p.id)).toEqual(["public"]);
  expect((await call("/api/marketplace/library")).status).toBe(401);
  const auth = await principal("buyer", "member", "test-buyer-token");
  expect((await call("/api/marketplace/library", undefined, auth)).status).toBe(
    503,
  );
  const seen: Request[] = [];
  const connected = {
    ...bindings,
    MAX_MARKETPLACE: {
      fetch: async (input: any, init: any) => {
        seen.push(new Request(input, init));
        return Response.json([]);
      },
    },
  } as unknown as Env;
  const response = await marketplaceApi(
    new Request("https://portal.test/api/marketplace/library", {
      headers: { ...auth, "X-ICV-Subject": "someone-else" },
    }),
    connected,
  );
  expect(response!.status).toBe(200);
  expect(seen[0].headers.get("X-ICV-Subject")).toBe("buyer");
  expect(seen[0].headers.get("Authorization")).toBeNull();
  const denied = await marketplaceApi(
    new Request("https://portal.test/api/marketplace/download", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        productId: "private",
        idempotencyKey: "unique-operation-1234",
      }),
    }),
    connected,
  );
  expect(denied!.status).toBe(404);
  expect(seen).toHaveLength(1);
});
it("requires Package evidence, preserves decisions and appends a compensated reversal", async () => {
  const id = crypto.randomUUID();
  const gov = await principal("governor-alice", "governor", "test-alice-token");
  await bindings.DB.prepare(
    "INSERT INTO products(id,name,description,stage,division_id) VALUES (?,'Packaged product','A concrete specification for the product under test','Idea','max-apps')",
  )
    .bind(id)
    .run();
  expect((await call(`/api/factory/${id}/run`, {}, gov)).status).toBe(201);
  const stub = bindings.FACTORY_ACTOR!.get(
    bindings.FACTORY_ACTOR!.idFromName(id),
  );
  let wrongPackage = true;
  let compensationReady = false;
  const operations: any[] = [];
  const advance = () =>
    runInDurableObject(stub, async (instance: any, ctx) => {
      instance.env.ICVS_EXECUTOR = {
        fetch: async (url: string, init: RequestInit) => {
          const b = JSON.parse(init.body as string);
          operations.push({ ...b, url });
          if (url.endsWith("/compensate") && !compensationReady)
            return new Response(null, { status: 202 });
          return Response.json({
            operationId: b.operationId,
            artifact: "https://fixture.invalid/artifact",
            digest: (wrongPackage && b.stage === "Package" ? "b" : "a").repeat(
              64,
            ),
            checks:
              ["QA", "Package"].includes(b.stage) || url.endsWith("/compensate")
                ? [
                    {
                      requirement: url.endsWith("/compensate")
                        ? "compensation"
                        : b.stage === "Package"
                          ? "package"
                          : "brief",
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
  for (let i = 0; i < 12; i++) await advance();
  expect(
    await bindings.DB.prepare("SELECT stage FROM products WHERE id=?")
      .bind(id)
      .first("stage"),
  ).toBe("Package");
  expect(
    await bindings.DB.prepare(
      "SELECT count(*) AS n FROM approvals WHERE product_id=?",
    )
      .bind(id)
      .first("n"),
  ).toBe(0);
  wrongPackage = false;
  await advance();
  const approval = await bindings.DB.prepare(
    "SELECT id FROM approvals WHERE product_id=?",
  )
    .bind(id)
    .first<string>("id");
  expect(approval).toBeTruthy();
  expect(
    (await call(`/api/approvals/${approval}/approve`, {}, gov)).status,
  ).toBe(200);
  await advance();
  expect(
    await bindings.DB.prepare("SELECT stage FROM products WHERE id=?")
      .bind(id)
      .first("stage"),
  ).toBe("Published");
  const latest = await bindings.DB.prepare(
    "SELECT id,sequence,actor FROM workflow_events WHERE product_id=? ORDER BY sequence DESC LIMIT 1",
  )
    .bind(id)
    .first<any>();
  expect(
    await bindings.DB.prepare(
      "SELECT actor FROM workflow_events WHERE product_id=? AND engine='Promotion' ORDER BY sequence DESC LIMIT 1",
    )
      .bind(id)
      .first("actor"),
  ).toBe("governor-alice");
  const body = {
    eventId: latest.id,
    expectedSequence: latest.sequence,
    reason: "Reverse publication for a verified correction",
  };
  expect(
    (
      await call(
        `/api/factory/${id}/override`,
        { ...body, expectedSequence: 0 },
        gov,
      )
    ).status,
  ).toBe(409);
  expect((await call(`/api/factory/${id}/override`, body, gov)).status).toBe(
    202,
  );
  await advance();
  expect(
    await bindings.DB.prepare("SELECT stage FROM products WHERE id=?")
      .bind(id)
      .first("stage"),
  ).toBe("Published");
  expect(
    await bindings.DB.prepare(
      "SELECT status FROM factory_runs WHERE product_id=?",
    )
      .bind(id)
      .first("status"),
  ).toBe("blocked");
  expect(
    await bindings.DB.prepare(
      "SELECT count(*) AS n FROM deployments WHERE product_id=?",
    )
      .bind(id)
      .first("n"),
  ).toBe(1);
  compensationReady = true;
  await advance();
  // Automatic progression may already have republished; assert the durable restoration event.
  expect(
    await bindings.DB.prepare(
      "SELECT to_stage FROM workflow_events WHERE product_id=? AND engine='Reversal'",
    )
      .bind(id)
      .first("to_stage"),
  ).toBe("Ready");
  expect(
    await bindings.DB.prepare("SELECT status FROM approvals WHERE id=?")
      .bind(approval)
      .first("status"),
  ).toBe("approved");
  const reversal = await bindings.DB.prepare(
    "SELECT * FROM workflow_events WHERE product_id=? AND engine='Reversal'",
  )
    .bind(id)
    .first<any>();
  expect(JSON.parse(reversal.evidence).reverses).toBe(latest.id);
  expect(reversal.actor).toBe("governor-alice");
  expect(reversal.sequence).toBe(latest.sequence + 2);
  await advance();
  expect(operations.at(-1).operationId).toMatch(/:Publish:1$/);
  const pipeline = (await (await call("/api/universe/pipeline")).json()) as {
    stage: string;
    samples: number;
  }[];
  expect(pipeline.find((s) => s.stage === "Published")?.samples).toBe(0);
  expect(
    (await bindings.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});

it("orders dashboard and Universe pipelines from configured workflow, retaining history", async () => {
  const legacy = (await (await call("/api/pipeline")).json()) as {
    stage: string;
  }[];
  const graph = (await (await call("/api/universe/pipeline")).json()) as {
    stage: string;
  }[];
  for (const pipeline of [legacy, graph]) {
    expect(pipeline.slice(0, 11).map((s) => s.stage)).toEqual([
      "Idea",
      "Discovery",
      "Research",
      "Specification",
      "Architecture",
      "Simulation",
      "Build",
      "QA",
      "Package",
      "Ready",
      "Published",
    ]);
    expect(pipeline.some((s) => s.stage === "Archived")).toBe(true);
  }
});
