# Portal-OS1 + ICVS

A Cloudflare monorepo: a React/Vite governor console on **Pages**, a **Worker** API, **D1** for portfolio and approval data, and the existing **Durable Object** microkernel.

## Repository

- `apps/pages/`: mission control, portfolio/organization views, products, pipeline, approvals, analytics, forecasting, departments, governor console, settings and product factory; typed fetch clients in `src/api/`.
- `apps/worker/src/`: API routes, kernel actor, firewall, audit logger.
- `apps/worker/d1/`: versioned migrations and an explicit local-only synthetic seed.
- `icvs/`: existing cognitive frame bridge. Its existing simulated signature is not cryptographic authentication.
- `max-core/`, `portal-os/`, `adapters/`: integration boundaries documented in their README files.
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
- **Governor:** approve/reject pending requests, or override with a required reason; finalized requests stay final. History is persisted in D1. No decision automatically deploys a product.
- **ICVS departments:** GOV, STRAT, ARCH, BUILD, TEST, OPS, DATA and GROWTH with stage-based queues, recorded outputs, KPIs and health flags.
- **Intelligence:** recorded-score rankings, rule-based recommendations, and explicit revenue scenario assumptions. Revenue is monthly USD. Scores and revenue are recorded inputs, not independently inferred metrics.
- **Factory:** authenticated intake and per-product Durable Object coordination. A run saves intake, specification, architecture proposal and planning-completeness outputs atomically in D1, moves the product to Build, then blocks with an explicit handoff. Repeated/concurrent requests reuse the active run.

### Execution integrations still required

Factory outputs are planning templates requiring review. This repository has no product build executor, QA runner, package store, or publishing provider. Those engines are shown as requiring integrations. The factory does **not** claim to generate/test/deploy a finished product. Deployment telemetry remains empty until a trusted integration writes reports to D1. Runtime health describes stored kernel states, not live heartbeats. Forecasts are scenario calculations, not statistical predictions.

Migration 0003 preserves existing products and decisions and adds divisions and operational state; 0004 adds deployment telemetry. New lifecycle stages are Idea, Discovery, Specification, Architecture, Simulation, Build, Test, Package, Ready, Published. Legacy Validation, Live and Archived remain accepted and visible. Apply all migrations before starting the new Worker. The `v2` Durable Object migration adds `ProductFactoryActor` while retaining the original kernel actor.
