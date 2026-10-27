import type { Env } from "../types";
import { identityOf } from "./security";
const publishedStages = `SELECT json_extract(step.value,'$.stage') FROM workflow_definitions w, json_each(w.definition,'$.steps') step WHERE json_extract(step.value,'$.engine')='publish'`;
/** Marketplace owns commerce. Portal supplies published catalog visibility and ICV identity. */
export async function marketplaceApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/marketplace")) return null;
  const path = url.pathname.slice("/api/marketplace".length);
  if (path === "/catalog" && request.method === "GET") {
    const products = (
      await env.DB.prepare(
        `SELECT p.id,p.name,p.description,p.division_id AS divisionId,d.name AS division
      FROM products p JOIN divisions d ON d.id=p.division_id WHERE p.stage IN (${publishedStages}) ORDER BY p.name`,
      ).all()
    ).results;
    const divisions = (
      await env.DB.prepare(
        "SELECT id,name,parent_id AS parentId,category FROM divisions ORDER BY name",
      ).all()
    ).results;
    return Response.json({
      products,
      divisions,
      commerceConnected: !!env.MAX_MARKETPLACE,
    });
  }
  const read =
    ["/library", "/purchases", "/creators"].includes(path) &&
    request.method === "GET";
  const write =
    ["/checkout", "/download"].includes(path) && request.method === "POST";
  if (!read && !write)
    return Response.json(
      { error: "Marketplace operation not found" },
      { status: 404 },
    );
  const identity = await identityOf(request, env);
  if (
    !identity ||
    identity.id.startsWith("service:") ||
    identity.role === "automation"
  )
    return Response.json(
      { error: "A personal ICV identity is required" },
      { status: 401 },
    );
  if (!env.MAX_MARKETPLACE)
    return Response.json(
      {
        error: "MAX Marketplace is not connected; commerce remains unavailable",
      },
      { status: 503 },
    );
  let body: { productId?: string; idempotencyKey?: string } | undefined;
  if (write) {
    try {
      const raw = await request.text();
      if (raw.length > 2048) throw 0;
      body = JSON.parse(raw);
      if (
        !body ||
        typeof body.productId !== "string" ||
        body.productId.length > 120 ||
        typeof body.idempotencyKey !== "string" ||
        !/^[a-zA-Z0-9_-]{16,120}$/.test(body.idempotencyKey)
      )
        throw 0;
    } catch {
      return Response.json(
        { error: "Product ID and idempotency key required" },
        { status: 400 },
      );
    }
    const product = await env.DB.prepare(
      `SELECT id FROM products WHERE id=? AND stage IN (${publishedStages})`,
    )
      .bind(body.productId)
      .first();
    if (!product)
      return Response.json(
        { error: "Published product not found" },
        { status: 404 },
      );
  }
  const response = await env.MAX_MARKETPLACE.fetch(
    `https://marketplace.internal${path}`,
    {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "X-ICV-Subject": identity.id,
        ...(body
          ? { "Idempotency-Key": `${identity.id}:${body.idempotencyKey}` }
          : {}),
      },
      body: body ? JSON.stringify({ productId: body.productId }) : undefined,
      signal: AbortSignal.timeout(20_000),
    },
  );
  // Do not forward provider cookies, credentials or redirects to the public browser.
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
