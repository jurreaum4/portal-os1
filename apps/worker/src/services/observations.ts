import { authorised } from "./authorisation";
import type { Env } from "../types";
import { factoryStages } from "./console";

/** Integration-only telemetry ingestion; the browser never receives this credential. */
export async function ingestObservation(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.OBSERVATION_API_TOKEN)
    return Response.json(
      { error: "Observation ingestion is not configured" },
      { status: 503 },
    );
  if (!(await authorised(request, env.OBSERVATION_API_TOKEN)))
    return Response.json(
      { error: "Integration authorisation required" },
      { status: 401 },
    );
  if (!env.DB)
    return Response.json(
      { error: "Storage is not configured" },
      { status: 503 },
    );
  // Bound streamed input before JSON parsing, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "JSON body required" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16384) {
      await reader.cancel();
      return Response.json({ error: "Observation too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return Response.json({ error: "Invalid observation" }, { status: 400 });
  const b = value as Record<string, unknown>;
  const text = (key: string, max = 1000) =>
    b[key] === undefined ||
    b[key] === null ||
    (typeof b[key] === "string" &&
      (b[key] as string).trim().length > 0 &&
      (b[key] as string).length <= max);
  const numeric = (key: string, max: number, integer = false) =>
    b[key] === undefined ||
    b[key] === null ||
    (typeof b[key] === "number" &&
      Number.isFinite(b[key]) &&
      (b[key] as number) >= 0 &&
      (b[key] as number) <= max &&
      (!integer || Number.isSafeInteger(b[key])));
  const nullable = (key: string) => b[key] ?? null;
  const fail = () =>
    Response.json({ error: "Invalid observation fields" }, { status: 400 });
  if (
    typeof b.source !== "string" ||
    !text("source", 200) ||
    typeof b.observedAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(b.observedAt) ||
    !Number.isFinite(Date.parse(b.observedAt)) ||
    new Date(b.observedAt).toISOString() !== b.observedAt ||
    Date.parse(b.observedAt) > Date.now() ||
    !numeric("health", 100)
  )
    return fail();
  if (b.kind === "product") {
    if (
      typeof b.productId !== "string" ||
      !text("productId", 200) ||
      !text("forecast", 2000) ||
      !text("revenuePeriod", 100) ||
      !numeric("revenueMinor", Number.MAX_SAFE_INTEGER, true) ||
      (b.workflowStage != null &&
        !factoryStages.includes(
          b.workflowStage as (typeof factoryStages)[number],
        )) ||
      (b.status != null &&
        !["queued", "running", "blocked", "complete"].includes(
          b.status as string,
        )) ||
      (b.currency != null &&
        (typeof b.currency !== "string" || !/^[A-Z]{3}$/.test(b.currency))) ||
      (b.revenueMinor != null &&
        (b.currency == null || b.revenuePeriod == null)) ||
      (b.forecastDueAt != null &&
        (typeof b.forecastDueAt !== "string" ||
          !Number.isFinite(Date.parse(b.forecastDueAt))))
    )
      return fail();
    if (
      !(await env.DB.prepare("SELECT id FROM products WHERE id=?")
        .bind(b.productId)
        .first())
    )
      return Response.json({ error: "Product not found" }, { status: 404 });
    const result = await env.DB.prepare(
      `INSERT INTO product_observations (product_id,workflow_stage,status,health,revenue_minor,currency,revenue_period,forecast,forecast_due_at,source,observed_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET workflow_stage=excluded.workflow_stage,status=excluded.status,health=excluded.health,revenue_minor=excluded.revenue_minor,currency=excluded.currency,revenue_period=excluded.revenue_period,forecast=excluded.forecast,forecast_due_at=excluded.forecast_due_at,source=excluded.source,observed_at=excluded.observed_at WHERE excluded.observed_at>product_observations.observed_at`,
    )
      .bind(
        b.productId,
        nullable("workflowStage"),
        nullable("status"),
        nullable("health"),
        nullable("revenueMinor"),
        nullable("currency"),
        nullable("revenuePeriod"),
        nullable("forecast"),
        nullable("forecastDueAt"),
        b.source,
        b.observedAt,
      )
      .run();
    return Response.json(
      result.meta.changes
        ? { success: true }
        : { error: "A newer or identical observation already exists" },
      { status: result.meta.changes ? 200 : 409 },
    );
  }
  if (b.kind === "department") {
    if (
      ![
        "GOV",
        "STRAT",
        "ARCH",
        "BUILD",
        "TEST",
        "OPS",
        "DATA",
        "GROWTH",
      ].includes(b.department as string) ||
      typeof b.status !== "string" ||
      !text("status", 100) ||
      !numeric("queue", Number.MAX_SAFE_INTEGER, true) ||
      !text("currentWork") ||
      !text("kpiName", 100) ||
      !text("kpiValue", 100)
    )
      return fail();
    const result = await env.DB.prepare(
      `INSERT INTO department_observations (department,health,status,queue,current_work,kpi_name,kpi_value,source,observed_at) VALUES (?,?,?,?,?,?,?,?,?)
   ON CONFLICT(department) DO UPDATE SET health=excluded.health,status=excluded.status,queue=excluded.queue,current_work=excluded.current_work,kpi_name=excluded.kpi_name,kpi_value=excluded.kpi_value,source=excluded.source,observed_at=excluded.observed_at WHERE excluded.observed_at>department_observations.observed_at`,
    )
      .bind(
        b.department,
        nullable("health"),
        b.status,
        nullable("queue"),
        nullable("currentWork"),
        nullable("kpiName"),
        nullable("kpiValue"),
        b.source,
        b.observedAt,
      )
      .run();
    return Response.json(
      result.meta.changes
        ? { success: true }
        : { error: "A newer or identical observation already exists" },
      { status: result.meta.changes ? 200 : 409 },
    );
  }
  return fail();
}
