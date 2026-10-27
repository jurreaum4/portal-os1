import type { Env } from "./types";
import { customer, customerAuth, readObject } from "./customer-auth";

const columns = `r.id,r.slug,r.title,r.summary,r.type,r.price_minor AS priceMinor,r.currency,r.published_at AS publishedAt,
 c.name AS creatorName,c.slug AS creatorSlug`;
const categories: Record<string, string[]> = {
  games: ["game"],
  apps: ["app", "framework"],
  art: ["art", "asset"],
  media: ["media"],
  institute: ["course"],
};
interface Release {
  id: string;
  price_minor: number;
  currency: string;
  download_ref: string;
  title: string;
}
interface Order {
  id: string;
  release_id: string;
  price_minor: number;
  currency: string;
  status: string;
  provider_ref: string | null;
}
const json = (value: unknown, status = 200) => Response.json(value, { status });
async function owned(env: Env, customerId: string, releaseId: string) {
  return env.DB.prepare(
    "SELECT l.release_id FROM customer_library l JOIN marketplace_orders o ON o.customer_id=l.customer_id AND o.release_id=l.release_id WHERE l.customer_id=? AND l.release_id=? AND o.status='paid'",
  )
    .bind(customerId, releaseId)
    .first();
}
export async function settleOrder(env: Env, userId: string, order: Order) {
  if (
    !env.PAYMENTS ||
    !order.provider_ref ||
    order.status === "refunded" ||
    order.status === "failed"
  )
    return order;
  const res = await env.PAYMENTS.fetch(
    `https://payments.internal/payments/${encodeURIComponent(order.provider_ref)}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  await env.DB.prepare("UPDATE marketplace_orders SET checked_at=? WHERE id=?")
    .bind(Date.now(), order.id)
    .run();
  if (!res.ok) return order;
  const evidence = (await res.json()) as {
    orderId?: unknown;
    amount?: unknown;
    currency?: unknown;
    status?: unknown;
  };
  if (
    evidence.orderId !== order.id ||
    evidence.amount !== order.price_minor ||
    evidence.currency !== order.currency ||
    !["pending", "paid", "failed", "refunded"].includes(String(evidence.status))
  )
    throw new Error("Payment evidence mismatch");
  // Never downgrade a completed payment to pending/failed or resurrect a refund.
  const next = String(evidence.status);
  if (next === "pending" || (order.status === "paid" && next !== "refunded"))
    return order;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE marketplace_orders SET status=? WHERE id=? AND customer_id=? AND (status='pending' OR (status='paid' AND ?='refunded'))",
    ).bind(next, order.id, userId, next),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customer_library(customer_id,release_id) SELECT customer_id,release_id FROM marketplace_orders WHERE id=? AND status='paid'",
    ).bind(order.id),
  ]);
  const stored = await env.DB.prepare(
    "SELECT status FROM marketplace_orders WHERE id=?",
  )
    .bind(order.id)
    .first<{ status: string }>();
  return { ...order, status: stored?.status ?? order.status };
}
export async function marketplaceApi(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname;
  const auth = await customerAuth(request, env, path);
  if (auth) return auth;
  const category = path.slice("/api/".length);
  if (path === "/api/products" || Object.hasOwn(categories, category)) {
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);
    const offset = Number(url.searchParams.get("cursor") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 24);
    const q = url.searchParams.get("q") ?? "";
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 1_000_000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      q.length > 100
    )
      return json({ error: "Invalid catalog query" }, 400);
    const types = categories[category];
    const filter = types
      ? ` AND r.type IN (${types.map(() => "?").join(",")})`
      : "";
    const items = (
      await env.DB.prepare(
        `SELECT ${columns} FROM marketplace_releases r JOIN marketplace_creators c ON c.id=r.creator_id
      WHERE r.withdrawn_at IS NULL AND (r.title LIKE ? OR r.summary LIKE ?)${filter} ORDER BY r.published_at DESC,r.id LIMIT ? OFFSET ?`,
      )
        .bind(`%${q}%`, `%${q}%`, ...(types ?? []), limit + 1, offset)
        .all()
    ).results;
    return json({
      items: items.slice(0, limit),
      nextCursor: items.length > limit ? offset + limit : null,
    });
  }
  const product = path.match(/^\/api\/products\/([a-z0-9-]+)$/);
  if (product) {
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);
    const item = await env.DB.prepare(
      `SELECT ${columns} FROM marketplace_releases r JOIN marketplace_creators c ON c.id=r.creator_id WHERE r.slug=? AND r.withdrawn_at IS NULL`,
    )
      .bind(product[1])
      .first<{ id: string }>();
    if (!item) return json({ error: "Product not found" }, 404);
    const reviews = (
      await env.DB.prepare(
        "SELECT a.name,v.rating,v.body,v.updated_at AS updatedAt FROM marketplace_reviews v JOIN customer_accounts a ON a.id=v.customer_id WHERE v.release_id=? ORDER BY v.updated_at DESC LIMIT 50",
      )
        .bind(item.id)
        .all()
    ).results;
    return json({ ...item, reviews });
  }
  const creator = path.match(/^\/api\/creators\/([a-z0-9-]+)$/);
  if (creator) {
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);
    const profile = await env.DB.prepare(
      "SELECT c.name,c.slug,c.bio FROM marketplace_creators c WHERE c.slug=? AND EXISTS(SELECT 1 FROM marketplace_releases r WHERE r.creator_id=c.id AND r.withdrawn_at IS NULL)",
    )
      .bind(creator[1])
      .first();
    if (!profile) return json({ error: "Creator not found" }, 404);
    const items = (
      await env.DB.prepare(
        `SELECT ${columns} FROM marketplace_releases r JOIN marketplace_creators c ON c.id=r.creator_id WHERE c.slug=? AND r.withdrawn_at IS NULL ORDER BY r.published_at DESC LIMIT 100`,
      )
        .bind(creator[1])
        .all()
    ).results;
    return json({ ...profile, items });
  }
  if (!/^\/api\/(account|library|downloads|orders|reviews)(\/|$)/.test(path))
    return json({ error: "Not found" }, 404);
  const user = await customer(request, env);
  if (!user) return json({ error: "Sign in to your MAX account" }, 401);
  if (path === "/api/account") {
    if (request.method === "GET") return json(user);
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    const body = await readObject(request);
    if (
      typeof body.name !== "string" ||
      body.name.trim().length < 2 ||
      body.name.trim().length > 80
    )
      return json({ error: "Name must be 2–80 characters" }, 400);
    await env.DB.prepare("UPDATE customer_accounts SET name=? WHERE id=?")
      .bind(body.name.trim(), user.id)
      .run();
    return json({ ...user, name: body.name.trim() });
  }
  if (path === "/api/library" && request.method === "GET") {
    const hidden = url.searchParams.get("hidden") === "true" ? 1 : 0;
    return json(
      (
        await env.DB.prepare(
          `SELECT ${columns},l.hidden FROM customer_library l JOIN marketplace_releases r ON r.id=l.release_id JOIN marketplace_creators c ON c.id=r.creator_id JOIN marketplace_orders o ON o.customer_id=l.customer_id AND o.release_id=l.release_id WHERE l.customer_id=? AND l.hidden=? AND o.status='paid' AND r.withdrawn_at IS NULL ORDER BY l.granted_at DESC`,
        )
          .bind(user.id, hidden)
          .all()
      ).results,
    );
  }
  const library = path.match(/^\/api\/library\/([^/]+)$/);
  if (library && request.method === "POST") {
    const body = await readObject(request);
    if (typeof body.hidden !== "boolean")
      return json({ error: "Choose whether to hide this product" }, 400);
    const result = await env.DB.prepare(
      "UPDATE customer_library SET hidden=? WHERE customer_id=? AND release_id=?",
    )
      .bind(body.hidden ? 1 : 0, user.id, library[1])
      .run();
    return result.meta.changes
      ? json({ success: true })
      : json({ error: "Library item not found" }, 404);
  }
  if (path === "/api/orders" && request.method === "GET")
    return json(
      (
        await env.DB.prepare(
          "SELECT o.id,o.price_minor AS priceMinor,o.currency,o.status,r.title,o.created_at AS createdAt FROM marketplace_orders o JOIN marketplace_releases r ON r.id=o.release_id WHERE o.customer_id=? ORDER BY o.created_at DESC LIMIT 100",
        )
          .bind(user.id)
          .all()
      ).results,
    );
  const orderPath = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderPath && request.method === "GET") {
    const order = await env.DB.prepare(
      "SELECT * FROM marketplace_orders WHERE id=? AND customer_id=?",
    )
      .bind(orderPath[1], user.id)
      .first<Order>();
    if (!order) return json({ error: "Order not found" }, 404);
    const updated = await settleOrder(env, user.id, order);
    return json({ id: updated.id, status: updated.status });
  }
  if (
    ["/api/orders", "/api/downloads", "/api/reviews"].includes(path) &&
    request.method === "POST"
  ) {
    const body = await readObject(request);
    if (typeof body.releaseId !== "string" || body.releaseId.length > 120)
      return json({ error: "Choose a product" }, 400);
    const release = await env.DB.prepare(
      "SELECT * FROM marketplace_releases WHERE id=? AND withdrawn_at IS NULL",
    )
      .bind(body.releaseId)
      .first<Release>();
    if (!release) return json({ error: "Product not found" }, 404);
    if (path === "/api/orders") {
      if (release.price_minor > 0 && !env.PAYMENTS)
        return json({ error: "Purchasing is not available yet" }, 503);
      await env.DB.prepare(
        "INSERT OR IGNORE INTO marketplace_orders(id,customer_id,release_id,price_minor,currency,status) VALUES (?,?,?,?,?,?)",
      )
        .bind(
          crypto.randomUUID(),
          user.id,
          release.id,
          release.price_minor,
          release.currency,
          release.price_minor === 0 ? "paid" : "pending",
        )
        .run();
      const order = (await env.DB.prepare(
        "SELECT * FROM marketplace_orders WHERE customer_id=? AND release_id=?",
      )
        .bind(user.id, release.id)
        .first<Order>())!;
      if (order.status === "paid") {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO customer_library(customer_id,release_id) VALUES (?,?)",
        )
          .bind(user.id, release.id)
          .run();
        return json({ id: order.id, status: "paid" });
      }
      if (order.status !== "pending")
        return json({ error: "This order is closed; contact support" }, 409);
      if (!env.MARKETPLACE_ORIGIN)
        return json({ error: "Checkout is not configured" }, 503);
      const result = await env.PAYMENTS!.fetch(
        "https://payments.internal/checkout",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": order.id,
          },
          body: JSON.stringify({
            orderId: order.id,
            customerId: user.id,
            amount: order.price_minor,
            currency: order.currency,
            title: release.title,
            returnUrl: `${env.MARKETPLACE_ORIGIN}/account?order=${encodeURIComponent(order.id)}`,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!result.ok)
        return json({ error: "Checkout is temporarily unavailable" }, 503);
      const checkout = (await result.json()) as { id?: unknown; url?: unknown };
      if (
        typeof checkout.id !== "string" ||
        checkout.id.length > 200 ||
        typeof checkout.url !== "string" ||
        !/^https:\/\//.test(checkout.url)
      )
        throw new Error("Invalid checkout response");
      await env.DB.prepare(
        "UPDATE marketplace_orders SET provider_ref=? WHERE id=? AND status='pending'",
      )
        .bind(checkout.id, order.id)
        .run();
      return json({ id: order.id, status: "pending", url: checkout.url });
    }
    const order = await env.DB.prepare(
      "SELECT * FROM marketplace_orders WHERE customer_id=? AND release_id=?",
    )
      .bind(user.id, release.id)
      .first<Order>();
    if (order?.provider_ref) await settleOrder(env, user.id, order);
    if (!(await owned(env, user.id, release.id)))
      return json({ error: "This product is not in your library" }, 403);
    if (path === "/api/reviews") {
      if (
        !Number.isInteger(body.rating) ||
        Number(body.rating) < 1 ||
        Number(body.rating) > 5 ||
        typeof body.body !== "string" ||
        body.body.trim().length < 5 ||
        body.body.length > 2000
      )
        return json(
          { error: "Choose a rating from 1–5 and write 5–2000 characters" },
          400,
        );
      await env.DB.prepare(
        "INSERT INTO marketplace_reviews(customer_id,release_id,rating,body) VALUES (?,?,?,?) ON CONFLICT(customer_id,release_id) DO UPDATE SET rating=excluded.rating,body=excluded.body,updated_at=CURRENT_TIMESTAMP",
      )
        .bind(user.id, release.id, body.rating, body.body.trim())
        .run();
      return json({ success: true });
    }
    if (!env.DOWNLOADS)
      return json({ error: "Downloads are temporarily unavailable" }, 503);
    const grant = await env.DOWNLOADS.fetch(
      "https://downloads.internal/grant",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: user.id,
          releaseId: release.id,
          reference: release.download_ref,
          expiresIn: 300,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!grant.ok)
      return json({ error: "Download could not be prepared" }, 503);
    const result = (await grant.json()) as { url?: unknown };
    if (typeof result.url !== "string" || !/^https:\/\//.test(result.url))
      throw new Error("Invalid download grant");
    await env.DB.prepare(
      "INSERT INTO marketplace_downloads(id,customer_id,release_id) VALUES (?,?,?)",
    )
      .bind(crypto.randomUUID(), user.id, release.id)
      .run();
    return json({ url: result.url });
  }
  if (path === "/api/downloads" && request.method === "GET")
    return json(
      (
        await env.DB.prepare(
          "SELECT d.id,r.title,r.slug,d.release_id AS releaseId,d.created_at AS createdAt FROM marketplace_downloads d JOIN marketplace_releases r ON r.id=d.release_id WHERE d.customer_id=? ORDER BY d.created_at DESC LIMIT 100",
        )
          .bind(user.id)
          .all()
      ).results,
    );
  return json({ error: "Method not allowed" }, 405);
}

export async function reconcilePayments(env: Env) {
  if (!env.PAYMENTS) return;
  const orders = (
    await env.DB.prepare(
      "SELECT * FROM marketplace_orders WHERE provider_ref IS NOT NULL AND status IN ('pending','paid') ORDER BY checked_at,id LIMIT 50",
    ).all<Order & { customer_id: string }>()
  ).results;
  for (const order of orders) {
    try {
      await settleOrder(env, order.customer_id, order);
    } catch {
      await env.DB.prepare(
        "UPDATE marketplace_orders SET checked_at=? WHERE id=?",
      )
        .bind(Date.now(), order.id)
        .run();
    }
  }
}
