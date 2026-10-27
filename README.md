# Portal-OS1 + ICVS

A Cloudflare monorepo: a React/Vite governor console on **Pages**, a **Worker** API, **D1** for portfolio and approval data, and the existing **Durable Object** microkernel.

## Repository

- `apps/pages/`: dashboard, portfolio, pipeline, product detail, approvals, analytics, settings; typed fetch clients in `src/api/`.
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

Open `http://localhost:5173`. With `VITE_API_URL` unset, local Pages proxies `/api` to `http://localhost:8787`. The Governor dashboard uses `GET /api/console` and `GET /api/system-health`; legacy endpoints remain compatible. No provider credentials or emulators are needed for local D1 and Durable Objects: Wrangler supplies those bindings.

To enable local approval decisions, create `.dev.vars` at the repo root containing `GOVERNOR_API_TOKEN="<a-long-random-token>"`, restart the Worker, then sign in with that token in Settings. Never use a `VITE_` variable for this secret. The browser keeps the entered token in memory only. Read endpoints are public; protect the entire deployment with Cloudflare Access if your portfolio is private. This token is a minimal single-governor control; identity management and per-user roles require a separate integration.

```sh
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
```

See [the API and deployment guide](docs/05_PAGES_WORKER.md) for contracts, deployment, and integration limits. Deployment commands write to Cloudflare and should be run with the intended account.
