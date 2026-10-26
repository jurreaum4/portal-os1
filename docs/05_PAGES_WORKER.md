# Pages and Worker boundary

```mermaid
flowchart LR
  Browser --> Pages[Cloudflare Pages: React]
  Pages -->|fetch /api/*| Worker[Cloudflare Worker]
  Worker --> D1
  Worker --> Actors[Durable Objects: existing kernel IPC]
```

ICVS lives in `icvs/index.ts`; MAX-CORE is an integration boundary awaiting its actual implementation. The per-product factory actor now coordinates planning artifacts and stops at an explicit Build handoff. No external build executor, QA runner, scheduler, recovery engine, or publication provider is configured. Approval decisions record governor intent; they do not publish products automatically.

## API

All responses are JSON. New endpoints return 404 for unknown routes or IDs, 405 for unsupported methods, and generic 500 errors if storage fails. Legacy `/api/kernel/*` behavior and root status are preserved, including the existing wildcard kernel CORS policy. The existing recovery and ICVS ingestion URLs in the Dart client are still placeholders in the kernel and are not implemented by this change.

| Endpoint                          | Response                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/dashboard`              | `{ projects, activeProducts, readyToPublish, approvals, health }`                     |
| `GET /api/products`               | Array of products                                                                     |
| `GET /api/products/:id`           | One product, or 404                                                                   |
| `GET /api/portfolio`              | Products ranked by score, highest first                                               |
| `GET /api/pipeline`               | Array of `{ stage, products }` covering ten lifecycle stages plus three legacy stages |
| `GET /api/approvals`              | Pending `{ id, productId, project, action, priority, risk, status }` records          |
| `POST /api/approvals/:id/approve` | `{ success: true, status: "approved" }`                                               |
| `POST /api/approvals/:id/reject`  | `{ success: true, status: "rejected" }`                                               |
| `GET /api/analytics`              | `{ stage, count, averageScore }[]`                                                    |
| `GET /api/telemetry`              | `{ state, count }[]` from virtual processes                                           |
| `GET /api/governance`             | `{ status, count }[]` from approval history                                           |

Product fields: `id`, `name`, `description`, `stage`, `score` (0–100), `updatedAt` (SQLite UTC timestamp), `divisionId`, `revenue` (monthly USD), and `status` (On track, Attention, Paused). Stages: Idea, Discovery, Specification, Architecture, Simulation, Build, Test, Package, Ready, Published; legacy Validation, Live and Archived remain supported. Active products means Live or Published; ready to publish means Ready. Process health is the rounded percentage of READY, RUNNING, and SUSPENDED processes among all stored processes. It is `null` when there are none. This measures stored process states, not a live heartbeat or infrastructure SLA.

Decision requests require `Authorization: Bearer <GOVERNOR_API_TOKEN>`. Missing server configuration returns 503; invalid authorization returns 401. Decisions atomically update only pending requests; a second decision returns 409, a nonexistent ID returns 404. Changes persist in D1. SQL values are parameterized. The API accepts validated new product intake and division creation; it does not accept arbitrary product edits.

The new API allows browser origins listed in comma-separated `ALLOWED_ORIGINS`. Configure exact scheme/host/port values. OPTIONS permits Content-Type and Authorization. Disallowed browser origins receive 403. CORS is not authentication; non-browser clients can access public read routes. API responses use `Cache-Control: no-store`.

## Cloudflare deployment

1. Confirm the existing D1 database ID and Durable Object namespace in `wrangler.toml` belong to the intended account. The `v1` actor migration and class name are preserved. Do not recreate them for an existing deployment.
2. Add the exact deployed Pages/custom origins to `ALLOWED_ORIGINS` in `wrangler.toml`. Add individual preview origins when needed; wildcard subdomains are not interpreted.
3. Apply migrations with `npx wrangler d1 migrations apply DB --remote`. Migration 0001 uses the existing kernel schema with `IF NOT EXISTS`; 0002 adds products and approvals. Existing kernel rows remain intact. Do not run the demo seed remotely.
4. Set the Worker secret with `npx wrangler secret put GOVERNOR_API_TOKEN` and deploy with `npm run deploy:worker`.
5. Create a Cloudflare Pages project connected to this monorepo. Set root directory to the repository root, build command `npm ci && npm run build`, output directory `apps/pages/dist`, and Node version 24 (or 22.12+).
6. Set **Pages build variable** `VITE_API_URL=https://portal-os1.maxjurreau.workers.dev` for production and the intended API origin for previews. Rebuild after changing it. No secrets belong in Pages `VITE_` variables.
7. Alternatively run `npm run deploy:pages` after authenticating Wrangler and configuring the build variable in the local build environment. Pages' default SPA fallback handles direct links; no top-level `404.html` is emitted.
8. Populate real product and approval data through trusted backend integrations. Empty production tables display empty states. The optional seed is synthetic local data only.

The pre-existing workflow under `github/workflows/` is not an active GitHub Actions path. This implementation documents explicit deployment commands rather than enabling automatic production deployment. Run type checks, tests and build before deployment. Cloudflare pricing and account quotas must be checked against actual usage; this structure cannot guarantee a zero-dollar bill.

## Command centre extensions

| Endpoint                              | Contract                                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/divisions`                  | Registered `{id,name,color}[]`                                                                                                                                                    |
| `POST /api/divisions`                 | Authenticated `{name}`; creates a future division, duplicate name returns 409                                                                                                     |
| `POST /api/intake`                    | Authenticated `{name,description,divisionId}`; creates an Idea and activity in one D1 transaction                                                                                 |
| `GET /api/overview`                   | Average portfolio score, revenue, build queue, flags and published counts                                                                                                         |
| `GET /api/runtime`                    | `{processes,sampledAt,source}`; stored kernel states                                                                                                                              |
| `GET /api/processes`                  | Stored process IDs, owners, states and last heartbeat epochs                                                                                                                      |
| `GET /api/system-health`              | Worker/D1 read health, binding configuration, and stored process summary                                                                                                          |
| `GET /api/deployments`                | Latest 20 trusted deployment reports; empty until integrated                                                                                                                      |
| `GET /api/activity`                   | Latest 30 intake/planning operational events                                                                                                                                      |
| `GET /api/forecasts`                  | Division revenue and explicit −5%/0%/+10% one-month scenarios; UI compounds assumptions over a chosen horizon                                                                     |
| `GET /api/recommendations`            | Rules flag Attention, Ready, and high-scoring non-live products                                                                                                                   |
| `GET /api/departments`                | Eight department queues, KPIs, health flags and recorded outputs                                                                                                                  |
| `POST /api/approvals/:id/override`    | Authenticated `{reason}` (10–1000 characters); atomically finalizes a pending request as overridden; does not reverse prior decisions or publish                                  |
| `GET /api/decisions`                  | Latest 50 finalized decisions including override reasons                                                                                                                          |
| `GET /api/factory`                    | Latest 100 persisted planning runs                                                                                                                                                |
| `POST /api/factory/:productId/run`    | Authenticated; per-product actor serializes planning from Idea/Discovery/Validation; returns a Build-blocked run (201 new, 200 reused); invalid stage 409, insufficient brief 422 |
| `GET /api/factory/:productId/outputs` | Persisted planning outputs (JSON text) ordered by creation                                                                                                                        |

All new writes use the existing governor bearer token. Missing configuration returns 503 and invalid authorization returns 401. Invalid intake returns 400. Factory transaction failures leave no partial planning result. Its partial unique index prevents multiple active runs per product. Planning artifacts are templates, with explicit review requirements, not generated implementations or runtime simulations. Build, QA, packaging and publishing remain blocked pending execution integrations.

DATA currently surfaces recorded scores through intelligence views; it does not autonomously compute validated product scores. Department health is derived from product Attention flags. System health does not probe Durable Object availability or deployment health; it reports configuration separately. Existing product rows default to MAX Games, zero monthly revenue, and On track because their legacy records did not carry those fields. Reconcile those defaults through trusted backend administration before relying on migrated division or financial data.

Apply migrations 0003 and 0004 remotely using the documented migration procedure before deploying this revision. `wrangler.toml` adds only the new factory actor's `v2` migration; preserve `v1`. The optional local seed contains synthetic products across all four divisions and no invented runtime or successful deployment events.
