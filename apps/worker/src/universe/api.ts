import type { Env } from "../types";
import { roleOf, identityOf } from "./security";
import { universe } from "./graph";
const json = (body: unknown, status = 200) => Response.json(body, { status });
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, min = 1, max = 200): v is string =>
  typeof v === "string" && v.trim().length >= min && v.length <= max;
async function exists(db: D1Database, id: string): Promise<boolean> {
  if (id === "ecosystem:max") return true;
  const [kind, ...parts] = id.split(":");
  const key = parts.join(":");
  const tables: Record<string, string> = {
    division: "divisions",
    product: "products",
    project: "factory_runs",
    department: "department_config",
  };
  if (tables[kind])
    return !!(await db
      .prepare(`SELECT id FROM ${tables[kind]} WHERE id=?`)
      .bind(key)
      .first());
  return !!(await db
    .prepare(
      "SELECT id FROM universe_records WHERE id=? AND kind='entity' AND deleted=0",
    )
    .bind(id)
    .first());
}
/** Called only through the existing actor's serialized ingestion route. */
export async function applyUniverseEvent(request: Request, env: Env) {
  let b: Record<string, unknown>;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Body required");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 32768) {
        await reader.cancel();
        return json({ error: "Event exceeds 32 KiB" }, 413);
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const raw = new TextDecoder().decode(bytes);
    if (raw.length > 32768) return json({ error: "Event exceeds 32 KiB" }, 413);
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) throw 0;
    b = parsed;
  } catch {
    return json({ error: "Invalid JSON object" }, 400);
  }
  if (
    !text(b.eventId, 1, 120) ||
    !text(b.id, 1, 120) ||
    !["entity", "relationship", "observation"].includes(String(b.kind)) ||
    !Number.isSafeInteger(b.expectedRevision) ||
    Number(b.expectedRevision) < 0 ||
    !text(b.source, 2, 120) ||
    !text(b.reason, 10, 1000) ||
    !isObject(b.data) ||
    typeof b.deleted !== "boolean"
  )
    return json(
      {
        error:
          "Require eventId, id, kind, expectedRevision, source, reason, data and deleted",
      },
      400,
    );
  const d = b.data;
  const db = env.DB;
  const previous = await db
    .prepare("SELECT * FROM universe_records WHERE id=?")
    .bind(b.id)
    .first<{ revision: number; kind: string; data: string }>();
  const replay = await db
    .prepare("SELECT * FROM universe_events WHERE id=?")
    .bind(b.eventId)
    .first<{
      record_id: string;
      after_data: string;
      revision: number;
      kind: string;
      deleted: number;
      source: string;
      reason: string;
    }>();
  if (replay)
    return replay.record_id === b.id &&
      replay.after_data === JSON.stringify(d) &&
      replay.revision === Number(b.expectedRevision) + 1 &&
      replay.kind === b.kind &&
      replay.deleted === Number(b.deleted) &&
      replay.source === b.source &&
      replay.reason === b.reason
      ? json({ id: b.id, revision: replay.revision, reused: true })
      : json({ error: "Event ID already used for different content" }, 409);
  if (
    (previous?.revision ?? 0) !== b.expectedRevision ||
    (previous && previous.kind !== b.kind)
  )
    return json({ error: "Revision conflict" }, 409);
  if (b.deleted && !previous)
    return json({ error: "Cannot retract a missing record" }, 404);
  if (!b.deleted) {
    const allowed: Record<string, string[]> = {
      entity: ["name", "kind", "parentId", "category", "status"],
      relationship: ["from", "to", "type"],
      observation: [
        "entityId",
        "observedAt",
        "currency",
        "metrics",
        "moduleId",
      ],
    };
    if (Object.keys(d).some((k) => !allowed[String(b.kind)].includes(k)))
      return json({ error: "Unsupported record fields" }, 400);
    if (b.kind === "entity") {
      if (
        !String(b.id).startsWith("external:") ||
        !text(d.name, 2, 120) ||
        ![
          "asset",
          "service",
          "runtime",
          "creator",
          "competitor",
          "athlete",
          "team",
          "project",
        ].includes(String(d.kind)) ||
        (d.category !== undefined && !text(d.category)) ||
        (d.status !== undefined && !text(d.status)) ||
        (d.parentId !== undefined &&
          (!text(d.parentId) || !(await exists(db, d.parentId))))
      )
        return json({ error: "Invalid entity or parent" }, 400);
      let parent = d.parentId as string | undefined;
      const visited = new Set<string>([String(b.id)]);
      while (parent?.startsWith("external:")) {
        if (visited.has(parent))
          return json({ error: "Containment cycle" }, 400);
        visited.add(parent);
        const record = await db
          .prepare(
            "SELECT data FROM universe_records WHERE id=? AND kind='entity' AND deleted=0",
          )
          .bind(parent)
          .first<string>("data");
        parent = record ? JSON.parse(record).parentId : undefined;
      }
    } else if (b.kind === "relationship") {
      if (
        !text(d.from) ||
        !text(d.to) ||
        d.from === d.to ||
        ![
          "depends_on",
          "uses",
          "creates",
          "distributes",
          "competes_with",
        ].includes(String(d.type)) ||
        !(await exists(db, d.from)) ||
        !(await exists(db, d.to))
      )
        return json({ error: "Invalid relationship endpoints or type" }, 400);
    } else {
      const keys = new Set([
        "revenue",
        "users",
        "impact",
        "downloads",
        "sales",
        "engagement",
        "health",
        "capacity",
        "throughput",
        "injuries",
        "wins",
        "losses",
        "draftRank",
        "scoutingScore",
        "simulationRuns",
        "valuation",
        "mediaReach",
        "marketInterest",
      ]);
      if (
        d.moduleId !== undefined &&
        (!text(d.moduleId) ||
          !(await db
            .prepare("SELECT id FROM universe_modules WHERE id=?")
            .bind(d.moduleId)
            .first()))
      )
        return json({ error: "Unknown intelligence module" }, 400);
      if (
        !text(d.entityId) ||
        !(await exists(db, d.entityId)) ||
        !text(d.observedAt) ||
        !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(d.observedAt) ||
        !Number.isFinite(Date.parse(d.observedAt)) ||
        Date.parse(d.observedAt) > Date.now() + 60_000 ||
        d.currency !== "USD" ||
        !isObject(d.metrics) ||
        !Object.keys(d.metrics).length ||
        Object.entries(d.metrics).some(
          ([k, v]) =>
            !keys.has(k) ||
            typeof v !== "number" ||
            !Number.isFinite(v) ||
            v < 0 ||
            v > 1e15 ||
            (k === "health" && v > 100),
        )
      )
        return json(
          {
            error:
              "Invalid observation; use UTC timestamp, USD and finite nonnegative metrics",
          },
          400,
        );
    }
  }
  const revision = Number(b.expectedRevision) + 1,
    at = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO universe_events(id,record_id,revision,kind,before_data,after_data,source,actor,reason,deleted,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        b.eventId,
        b.id,
        revision,
        b.kind,
        previous?.data ?? null,
        JSON.stringify(d),
        b.source,
        request.headers.get("X-ICV-Actor") ?? "automation",
        b.reason,
        Number(b.deleted),
        at,
      ),
    db
      .prepare(
        "INSERT INTO universe_records(id,kind,revision,data,source,deleted,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data,source=excluded.source,deleted=excluded.deleted,updated_at=excluded.updated_at",
      )
      .bind(
        b.id,
        b.kind,
        revision,
        JSON.stringify(d),
        b.source,
        Number(b.deleted),
        at,
      ),
  ]);
  return json({ id: b.id, revision }, 201);
}
export async function universeApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/universe")) return null;
  const role = await roleOf(request, env);
  if (!role)
    return json(
      {
        error:
          "Universe access requires a viewer, automation or governor credential",
      },
      401,
    );
  if (url.pathname === "/api/universe/events" && request.method === "POST") {
    if (role !== "automation")
      return json(
        { error: "Only the automation role may ingest observations" },
        403,
      );
    if (!env.FACTORY_ACTOR)
      return json({ error: "Factory actor unavailable" }, 503);
    const size = Number(request.headers.get("Content-Length") ?? 0);
    if (size > 32768) return json({ error: "Event exceeds 32 KiB" }, 413);
    const forwarded = new Request(
      "https://factory.internal/universe/event",
      request,
    );
    forwarded.headers.set(
      "X-ICV-Actor",
      (await identityOf(request, env))!.id.replace(/^service:/, ""),
    );
    forwarded.headers.delete("Authorization");
    return env.FACTORY_ACTOR.get(
      env.FACTORY_ACTOR.idFromName("icvs:universe-ingestion"),
    ).fetch(forwarded);
  }
  if (request.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  if (url.pathname === "/api/universe/events") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Record id required" }, 400);
    return json(
      (
        await env.DB.prepare(
          "SELECT * FROM universe_events WHERE record_id=? ORDER BY revision",
        )
          .bind(id)
          .all()
      ).results,
    );
  }
  const endpoints = [
    "/api/universe",
    "/api/universe/graph",
    "/api/universe/twins",
    "/api/universe/relationships",
    "/api/universe/spatial",
    "/api/universe/galaxy",
    "/api/universe/products",
    "/api/universe/pipeline",
    "/api/universe/departments",
    "/api/universe/sports",
    "/api/universe/quantum",
    "/api/universe/marketplace",
    "/api/universe/intelligence",
  ];
  if (!endpoints.includes(url.pathname))
    return json({ error: "Universe endpoint not found" }, 404);
  const graph = await universe(env);
  graph.access = { role, canDecide: role === "governor" };
  if (url.pathname.endsWith("/pipeline")) return json(graph.pipeline);
  if (url.pathname.endsWith("/departments")) return json(graph.departments);
  if (url.pathname.endsWith("/relationships")) return json(graph.relationships);
  if (url.pathname.endsWith("/twins")) {
    const id = url.searchParams.get("id");
    const twin = graph.nodes.find((n) => n.id === id);
    return id
      ? twin
        ? json(twin)
        : json({ error: "Twin not found" }, 404)
      : json(graph.nodes);
  }
  if (url.pathname.endsWith("/intelligence"))
    return json({
      recommendations: graph.recommendations,
      opportunities: graph.opportunities,
      risks: graph.nodes.filter((n) => n.risk === "High"),
      strategic: {
        priorities: graph.recommendations,
        capacity: graph.departments,
      },
      divisionIntelligence: graph.nodes.filter((n) => n.kind === "division"),
      ecosystemIntelligence: graph.summary,
      trends: graph.nodes.map((n) => ({
        entityId: n.id,
        growth: n.growth,
        history: n.history,
      })),
      competitive: graph.relationships
        .filter((r) => r.type === "competes_with")
        .map((r) => ({
          relationship: r,
          entity: graph.nodes.find((n) => n.id === r.from),
          competitor: graph.nodes.find((n) => n.id === r.to),
          method: "Side-by-side sourced observations; no inferred market share",
        })),
      methodology: graph.methodology,
    });
  let nodes = graph.nodes;
  const room = url.searchParams.get("room") ?? url.pathname.split("/").at(-1);
  if (room === "sports" || room === "quantum") {
    const category = room === "sports" ? "sports" : "xr";
    const ids = new Set(
      nodes.filter((n) => n.category === category).map((n) => n.id),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes)
        if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
          ids.add(n.id);
          changed = true;
        }
    }
    nodes = nodes.filter((n) => ids.has(n.id));
  } else if (room === "products")
    nodes = nodes.filter((n) =>
      ["product", "asset", "service", "runtime", "creator"].includes(n.kind),
    );
  else if (room === "departments")
    nodes = nodes.filter((n) => n.kind === "department");
  else if (room === "pipeline")
    nodes = nodes.filter((n) => ["product", "project"].includes(n.kind));
  const ids = new Set(nodes.map((n) => n.id));
  const relationships = graph.relationships.filter(
    (r) => ids.has(r.from) && ids.has(r.to),
  );
  if (url.pathname.endsWith("/spatial"))
    return json({
      schemaVersion: 1,
      coordinateSystem: "right-handed",
      upAxis: "Y",
      units: "layout-unit",
      sampledAt: graph.sampledAt,
      nodes,
      relationships,
      interaction: {
        select: "node.id",
        details: "/api/universe/twins?id={encodedNodeId}",
      },
    });
  return json({ ...graph, nodes, relationships });
}
