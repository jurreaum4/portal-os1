# Portal-OS1 v2 — MAX Universe

## Architecture and compatibility

V2 extends the existing private Pages console, Worker, D1 projections and product
factory Durable Object. MAX-CORE implementation and public interfaces are unchanged.
ICVS retains lifecycle decisions and orchestration; `portal-os/universe.ts` owns
read-model intelligence. UI components consume APIs and perform presentation only.
The public marketplace Worker does not route any v2 operational endpoint.

Two intentional additions to the previous contract:

- Migration `0007_universe.sql` adds MAX Apps alongside the existing five divisions.
  Arbitrary future divisions use the existing division API and appear automatically.
- The private root now opens `/portal/governor` for Governors and
  `/portal/ecosystem` for other staff. The original dashboard remains at
  `/portal/dashboard`; existing operational routes remain available.

New versioned execution monitoring requires migration 0007 before the private Worker
is upgraded. Existing v1 factory runs retain their original Ready/Archive behaviour.
A rejected **v2 verified package** now also queues resource compensation. The rejection
is final for that approval; compensation is a separate audited job and cannot rewrite
or erase workflow history. Published release withdrawal/rollback is not authorised by
this rejection path and still requires a separate release policy and adapter.

## Daily screens

| Route | Purpose |
| --- | --- |
| `/portal/governor` | Governor-only daily overview, risks, forecasts and embedded Approve/Reject/Override controls |
| `/portal/ecosystem` | Ecosystem and division status, revenue, growth and runtime services |
| `/portal/divisions/:id` | Dedicated division products, dependencies, health, forecasts and recommendations |
| `/portal/intelligence` | Product/division/revenue/growth/risk/health rankings, portfolio matrix, risk heatmap, promotion and archive review |
| `/portal/products/:id/twin` | Product health, users, revenue, stage, dependencies, forecasts and audit/history |
| `/portal/twin` | Interactive 2D relationship graph and complete relationship table |
| `/portal/workers` | Worker binding status, queues, attempts, leases, blocked jobs and compensation |
| `/portal/marketplace` | Product, creator, purchase, library, revenue and download-grant analytics |
| `/portal/factory` | Existing automated product factory |
| `/portal/departments` | All eight department metrics and daily historical trends |
| `/portal/forecasting` | Server-calculated scenarios with explicit growth/horizon assumptions |

Portfolio, publishing, approvals, products, pipeline, analytics, revenue and
recommendations also have `/portal/*` aliases. Read-only navigation and filtering
are available to staff. Only Governors can record human decisions. V2 adds no human
product creation, promotion, archive, execution or compensation controls.

## Private APIs

All GET endpoints require an existing authorised staff credential. Responses are
`Cache-Control: no-store`. Read models are capped at 5,000 source records per table;
if exceeded they return 413 rather than silently returning an incomplete portfolio.
Partitioning or cursor-based projections are required before exceeding that bound.
Product audit responses use the same bound; history returns the latest 90 daily rows.

| Endpoint | Response |
| --- | --- |
| `GET /api/ecosystem` | Summary, divisions, products, rankings, alerts, next action, methods and sample time |
| `GET /api/intelligence` | Same consistent intelligence contract |
| `GET /api/intelligence/forecasts?months=3&growth=0` | Division and total revenue scenarios; months 3/6/12, growth −20 to 30% |
| `GET /api/divisions/:id/command-centre` | Division summary, products and relationships |
| `GET /api/twin/products/:id` | Digital twin, 90-day history, workflow audit, runs and relationships |
| `GET /api/twin/graph` | Nodes/edges derived from divisions, products, factory projects, departments, stages and approvals |
| `GET /api/twin/topology?root=product:ID&depth=2` | Bidirectional neighbourhood, depth 0–4; cycle-safe |
| `GET /api/departments/:id/history` | Daily queue, running and blocked observations |
| `GET /api/marketplace/operations` | Aggregate product, creator and currency analytics; no customer identifiers |
| `GET /api/execution-workers` | Binding configuration, queue/health projections, recorded operations and compensation |

The graph endpoint also accepts `root` and `depth`. Nodes use kind-prefixed stable
IDs (`division:`, `product:`, `project:`, `department:`, `pipeline:`, `approval:`).
A factory run is the current project model; no duplicate project execution system is
introduced. Structural edges are derived. Product-to-product edges are supplied by
trusted automation, with retirement retaining the original relationship record.

### Trusted ingestion

Bodies are JSON objects limited to 16 KiB. Existing Governor integration credentials
remain accepted. Prefer `AUTOMATION_CREDENTIALS`, a private Worker secret containing:

```json
[{"id":"telemetry-adapter","tokenSha256":"<SHA256 of a private random token>","scopes":["telemetry:write"]}]
```

Allowed scopes are `telemetry:write` and `relationships:write`. These credentials
cannot access staff sessions, read private APIs, make Governor decisions or start
factory runs. Staff Admin/Operator/Read Only credentials cannot ingest these writes.
Audit logging records the named automation actor and outcome. Provider adapters must
send bearer credentials only to the private Worker, over HTTPS.

`POST /api/twin/telemetry`:

```json
{"productId":"existing-id","source":"verified-adapter","observedAt":"2026-10-27T12:00:00Z","users":120,"health":94}
```

Users must be a non-negative safe integer; health is 0–100. At least one metric is
required; omitted metrics remain unknown for that observation. Observations must be
within 90 days and no more than one minute in the future. Product/time is immutable:
identical retries succeed; changed data conflicts with 409. Current health and users
use only the newest observation from the last 24 hours; older timestamps remain
visible but stale values are not ranked. The adapter defines and documents how its
health/users metrics are measured; the console does not invent them.

`POST /api/twin/relationships`:

```json
{"id":"stable-integration-id","sourceId":"product-a","targetId":"product-b","relation":"depends_on","source":"architecture-adapter"}
```

Both products must exist, self-links are rejected, active duplicates conflict and
identical ID retries succeed. Relations are `depends_on` or `integrates_with`.
`POST /api/twin/relationships/:id/retire` takes a 10–1,000 character `reason` and
retains the retired relationship. Cycles are permitted and topology traversal keeps
a visited set. Relationships do not automatically modify lifecycle state.

## Intelligence and history

The existing scheduled Worker independently captures daily product/department
projections and reconciles compensation alongside factory intake recovery. Failure
in one scheduled task does not prevent the others from starting. Daily rows are
upserted to reflect that day's latest observation. Historical data accumulates after
deployment; it is not backfilled or fabricated. Configure retention/archival policy
for the append-only telemetry, audit, operations and daily history tables.

- Reported monthly USD revenue remains separate from settled marketplace currencies.
- Growth compares each product's current reported monthly revenue to its latest daily
  snapshot at least seven days old. Missing or zero baselines produce no percentage.
  Portfolio/division growth requires baseline coverage for every included product.
- Forecasts are explicit compound-growth scenarios and flat revenue baselines, not
  trained predictions. Capacity/department clearance forecasts reuse existing ICVS
  completion history and configured capacity; insufficient history remains unknown.
- Risks are a documented triage heuristic: 25 points per observed flag, capped at 100.
  Flags include Attention, Paused, blocked runs, unavailable dependencies and observed
  health below 70. The score is not a calibrated probability.
- High-scoring unblocked products can be promotion opportunities; paused products
  below score 40 can be archive review candidates. These views never change state.
  Next action prioritises the highest risk, then highest-scoring promotion opportunity.
- Marketplace analytics use correlated aggregates so downloads cannot multiply paid
  order totals. Currency amounts stay separate. Download counts represent signed URL
  grants issued; completed transfers require storage-provider telemetry.

## Execution monitoring and compensation

Build, QA, Package and Publishing share the existing global admission actor. The
same configured `ICVS_EXECUTION_SLOTS` limit now covers packaging and publishing as
well; default remains 2, accepted range 1–100. Adapters receive `leaseExpiresAt` and
must stop/fence execution at expiry. HTTP 202 means pending; requests time out after
20 seconds; actor retries retain stable operation IDs. Evidence received after lease
expiry cannot verify an operation. Repeated polls and interrupted requests must be
idempotent at the adapter. This is not an exactly-once external transaction guarantee.

`worker_operations` records attempts before provider calls, leased expiry, pending/
blocked/verified status and validated evidence. A verified receipt is revalidated and
reused after projection failures, preventing repeated external work. Detailed workflow
events retain the original lifecycle audit. Worker health is derived from bindings,
blocked attempts and expired leases; binding presence does not prove availability.
Approval gates are excluded from execution queues.

A rejected v2 package atomically queues one compensation job with its original build
artifact, build digest, package digest and approval. The scheduled reconciler claims a
60-second job lease, invokes the trusted binding `ICVS_COMPENSATOR`, and retries with
backoff from 30 seconds to 15 minutes. Missing binding/evidence keeps the job blocked.

Service contract:

- `POST https://compensator.internal/compensate`, `Idempotency-Key: <runId>:Compensate`
- Body: `operationId`, `productId`, `runId`, `leaseExpiresAt`, and
  `plan: {buildArtifact, buildDigest, packageDigest}`.
- HTTP 202 means still processing. A successful response must include exact matching
  `operationId`, `buildArtifact`, `buildDigest`, `packageDigest`, `reversed: true`,
  and an HTTPS `receipt` without embedded credentials.

The adapter must verify cleanup against those immutable targets, preserve retained
source/audit evidence and implement idempotency. A boolean from the browser is never
accepted. This job compensates rejected package execution resources; customer refunds,
published rollback and every possible external side effect require their own policy
and provider implementation.

## XR data preparation

Authorised GET endpoints:

1. `/api/xr/ecosystem-galaxy`
2. `/api/xr/product-constellation`
3. `/api/xr/pipeline-universe`
4. `/api/xr/department-operations`
5. `/api/xr/quantum-xr-command-room`

Responses expose `schemaVersion: 1`, scene name, stable graph nodes, valid edges,
`sampledAt` and deterministic illustrative metre coordinates in a right-handed,
Y-up frame. Scene membership is derived from the operational graph. Coordinates
are a layout, not physical telemetry. `root`/`depth` may narrow a scene; a root outside
the scene returns 404. No XR renderer, headset integration or spatial interaction
client is included. The 2D browser graph is for operational relationship exploration.

## Run and release

Use the existing setup and four development scripts from `07_MAX_ECOSYSTEM.md`.
The public API script reserves inspector port 9231 so both Workers can run together.
Apply `npm run db:migrate:local` before starting the updated private Worker. Snapshot
history begins when the configured Worker cron runs; local Wrangler cron must be
triggered explicitly if needed. Do not seed synthetic business data into production.

Required checks: `npm run typecheck`, `npm test`, `npm run build`, both Worker
`wrangler deploy --dry-run` configurations, migration/foreign-key checks, and private
browser journeys. Provider tests use isolated synthetic fixtures.

Still required for a production ecosystem: real identity/payment/download/build/
package/publishing/compensation adapters; deployment, secrets and host routing; real
telemetry and dependency ingestion sources; payment/moderation/retention policy; and
authorised published rollback policy. Predictive models and automatic discovery of
external dependencies are not provided by these descriptive projections. Existing
planning/specification engines also remain the existing baseline, rather than a
complete autonomous source-code generator. No production deployment is performed.
