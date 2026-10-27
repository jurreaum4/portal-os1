# Portal-OS1 + ICVS

A Cloudflare monorepo: a React/Vite governor console on **Pages**, a **Worker** API, **D1** for portfolio and approval data, and the existing **Durable Object** microkernel.

## Repository

- `apps/pages/`: mission control, portfolio/organization views, products, pipeline, approvals, analytics, forecasting, departments, governor console, settings and product factory; typed fetch clients in `src/api/`.
- `apps/worker/src/`: API routes, kernel actor, firewall, audit logger.
- `apps/worker/d1/`: versioned migrations and an explicit local-only synthetic seed.
- `icvs/`: existing cognitive frame bridge. Its existing simulated signature is not cryptographic authentication.
- `max-core/`: independent platform-neutral foundation workspace; see its [developer guide](max-core/README.md).
- `portal-os/`, `adapters/`: integration boundaries documented in their README files.
- `src/kernel/`: compatibility exports for older consumers. Existing Dart source files remain available.
- `wrangler.toml`: Worker entry point, D1 and Durable Object bindings.

## Local development

Requires Node 22.12+ and npm. From the repository root:

```sh
npm ci
npm run db:migrate:local
npm run db:seed:local # optional synthetic demo portfolio
cp apps/pages/.env.example apps/pages/.env.local
npm run dev:worker
# In another terminal:
npm run dev:pages
```

Open `http://localhost:5173`. Pages proxies same-origin `/api` requests to `http://127.0.0.1:8787` in local development. Set `VITE_API_URL` to the Worker origin for production Pages builds. Dashboard widgets load their own typed Worker endpoints. No provider credentials or emulators are needed for local D1 and Durable Objects: Wrangler supplies those bindings.

To enable local intake, division management, factory planning and approval decisions, create `.dev.vars` at the repo root containing `GOVERNOR_API_TOKEN="<a-long-random-token>"`, restart the Worker, then enter that token in Settings. Never use a `VITE_` variable for this secret. The browser keeps the entered token in memory only. Read endpoints are public; protect the entire deployment with Cloudflare Access if your portfolio is private. This token is a minimal single-governor control; identity management and per-user roles require a separate integration.

```sh
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
```

See [the API and deployment guide](docs/05_PAGES_WORKER.md) for contracts, deployment, and integration limits. Deployment commands write to Cloudflare and should be run with the intended account.

## Command centre

Portal-OS1 manages products across MAX Games, MAX Media, MAX Art, MAX Institute, and future divisions. It is an operational workspace, not a portfolio product.

- **Mission control:** portfolio score, product counts, monthly reported revenue, division filters, lifecycle distribution, build count, approval queue, system health, deployment telemetry, recommendations and activity. Export downloads the current overview as JSON.
- **Portfolio:** searchable, sortable table with division/stage/score/revenue/status, product cards, organization groups, and product detail with factory outputs.
- **Governor:** approve/reject pending requests, or override with a required reason; finalized requests stay final. History is persisted in D1. ICVS decisions promote verified projects to Ready or archive them; no decision deploys a product.
- **ICVS departments:** GOV, STRAT, ARCH, BUILD, TEST, OPS, DATA and GROWTH with stage-based queues, recorded outputs, KPIs and health flags.
- **Intelligence:** recorded-score rankings, rule-based recommendations, and explicit revenue scenario assumptions. Revenue is monthly USD. Automated project scores measure lifecycle evidence completeness; revenue remains a recorded input.
- **ICVS automation:** nine engines coordinate Idea → Discovery → Specification → Architecture → Simulation → Build → QA → Ready. Workflow state and retries live in the existing factory Durable Objects; lifecycle projections and every transition are persisted in D1. Governor actions are Approve, Reject and Override. Existing dashboard pages show progress, evidence and blockers.

### Execution integration

See [ICVS automation](docs/06_ICVS_AUTOMATION.md) for engine behavior, recovery, audit APIs and the real executor contract. Specification and architecture are grounded in the submitted brief; simulation checks workflow reachability using unchanged MAX-CORE. Build and QA require the optional trusted `ICVS_EXECUTOR` service binding; without it projects report blocked at Build. No successful execution, artifacts or telemetry are invented.

Migration 0005 adds QA and audit tables while preserving existing products, decisions, outputs and deployment records. Legacy Test, Package, Validation, Live, Published and Archived remain visible. Apply migrations before deploying. Existing Durable Object class names and bindings are preserved. A one-minute cron reconciles intake interrupted before actor activation.
