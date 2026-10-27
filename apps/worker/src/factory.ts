import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";
import type { OperationalProduct } from "./operations";

/** A per-product actor serializes intake planning. External execution stops at Build. */
export class ProductFactoryActor extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    return this.ctx.blockConcurrencyWhile(async () => {
      const { productId } = (await request.json()) as { productId: string };
      const db = this.env.DB!;
      const product = await db
        .prepare(
          "SELECT id,name,description,stage,score FROM products WHERE id=?",
        )
        .bind(productId)
        .first<OperationalProduct>();
      if (!product)
        return Response.json({ error: "Product not found" }, { status: 404 });
      const existing = await db
        .prepare(
          "SELECT id,status,stage,message FROM factory_runs WHERE product_id=? AND status IN ('running','blocked')",
        )
        .bind(productId)
        .first();
      if (existing) return Response.json({ ...existing, reused: true });
      if (!["Idea", "Discovery", "Validation"].includes(product.stage))
        return Response.json(
          {
            error:
              "Planning runs start from Idea, Discovery, or legacy Validation",
          },
          { status: 409 },
        );
      const runId = crypto.randomUUID();
      const artifacts = [
        {
          engine: "Intake",
          department: "STRAT",
          content: {
            name: product.name,
            brief: product.description,
            scope: "Product planning",
            acceptedAt: new Date().toISOString(),
          },
        },
        {
          engine: "Specification",
          department: "ARCH",
          content: {
            objective: product.description,
            deliverables: [
              "Implementation",
              "Automated tests",
              "Release package",
            ],
            acceptance: [
              "Requirements reviewed by governor",
              "Implementation verified by QA",
              "Publishing approved",
            ],
            reviewRequired: true,
          },
        },
        {
          engine: "Architecture",
          department: "ARCH",
          content: {
            proposal: "Pages → Worker → Durable Objects → D1",
            boundaries: [
              "Presentation",
              "API",
              "Workflow coordination",
              "Persistence",
            ],
            reviewRequired: true,
          },
        },
        {
          engine: "Simulation",
          department: "ARCH",
          content: {
            method: "Planning completeness checks",
            checks: [
              {
                name: "Product named",
                passed: product.name.trim().length >= 2,
              },
              {
                name: "Brief supplied",
                passed: product.description.trim().length >= 20,
              },
            ],
            executionSimulated: false,
            reviewRequired: true,
          },
        },
      ];
      if (product.description.trim().length < 20)
        return Response.json(
          {
            error:
              "Add a product brief of at least 20 characters before planning",
          },
          { status: 422 },
        );
      // One D1 transaction records the entire planning result. Failures leave no partial run.
      await db.batch([
        db
          .prepare(
            "INSERT INTO factory_runs (id,product_id,status,stage,message) VALUES (?,?,'blocked','Build',?)",
          )
          .bind(
            runId,
            productId,
            "Planning outputs ready. Connect a build executor to continue through Test, Package, and Ready.",
          ),
        ...artifacts.map((a) =>
          db
            .prepare(
              "INSERT INTO factory_outputs (id,run_id,engine,content) VALUES (?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              runId,
              a.engine,
              JSON.stringify(a.content, null, 2),
            ),
        ),
        db
          .prepare(
            "UPDATE products SET stage='Build',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          )
          .bind(productId),
        ...artifacts.map((a) =>
          db
            .prepare(
              "INSERT INTO activity (id,product_id,title,department) VALUES (?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              productId,
              `${product.name}: ${a.engine.toLowerCase()} output created`,
              a.department,
            ),
        ),
        db
          .prepare(
            "INSERT INTO activity (id,product_id,title,department,kind) VALUES (?,?,?,'BUILD','warning')",
          )
          .bind(
            crypto.randomUUID(),
            productId,
            `${product.name} is waiting for a build executor`,
          ),
      ]);
      return Response.json(
        { id: runId, status: "blocked", stage: "Build" },
        { status: 201 },
      );
    });
  }
}
