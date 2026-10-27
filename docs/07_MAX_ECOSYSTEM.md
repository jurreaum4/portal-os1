# MAX ecosystem implementation and integration contracts

## Boundaries and compatibility

The existing Pages console, Worker, D1 and Durable Object identities are retained.
`apps/marketplace` adds a separately built public frontend. The public API entry is
`apps/worker/src/marketplace-worker.ts`, configured by `wrangler.marketplace.toml`.
It shares D1 but exposes only published catalog allowlists and customer-owned data.
The private entry remains `apps/worker/src/index.ts`. Its operational APIs, root
kernel status, legacy IPC and telemetry now require staff authorisation. This is
an intentional change from the former public-read contract.

The same `/api/products` path has different contracts on the two origins:
marketplace catalog DTOs on `max.games`, internal records on `portal.max.games`.
Do not route public API traffic to the private entry. In production, route each
host's `/api/*` to its corresponding Worker and other paths to the matching Pages
build. Customer cookies use the public host only. Set MARKETPLACE_ORIGIN to the
exact public origin; marketplace mutations require that Origin as CSRF protection.
No credential or private artifact URL is included in catalog responses.

## Local development

Use Node 22.12+ and the repository's npm workspaces:

```sh
npm install
npm run db:migrate:local
npm run dev:worker
npm run dev:pages
# Additional terminals:
npm run dev:marketplace-api
npm run dev:marketplace
```

Portal: http://localhost:5173, private API: port 8787.
Marketplace: http://localhost:5174, public API: port 8788. Both API processes use
local D1 with migration 0006. The public API script sets the local marketplace
origin. Configure `.dev.vars` locally; never commit secrets. Existing published
legacy products do not automatically appear in the marketplace without a verified
release projection. There is no production seed or invented catalog data.

## Staff authentication

The existing `GOVERNOR_API_TOKEN` remains a Governor credential. Add individually
named staff credentials using the secret `STAFF_CREDENTIALS`, a JSON array:

```json
[{"id":"named-staff-id","role":"Operator","tokenSha256":"<64 lowercase hex SHA-256 characters>"}]
```

Roles: Governor, Admin, Operator, Read Only. All can read operational screens;
only Governor can mutate private APIs or read detailed decisions. Governor Console
is guarded in the frontend. Staff tokens are held in tab memory, attached to API
requests, and cleared on reload/sign-out. Invalidated credentials are rejected on
the next API request. `GET /api/session` returns the authenticated staff identity.
Staff role credentials do not authenticate customers. Customers cannot become
staff through registration. This is credential-based access; enterprise identity,
MFA and division-specific authorisation remain integration work.

The existing intake/run/division mutation APIs retain Governor permission for
compatibility with trusted integrations. Human factory intake controls have been
removed from the console; automated sources call the intake API. Adopt a dedicated
least-privilege source credential before exposing intake to additional systems.
Audit rows record private denials and mutations; workflow decisions include the
verified named staff actor. Configure upstream request throttling and audit
retention for production traffic.

## Customer identity service: CUSTOMER_IDENTITY

Connect a trusted service binding implementing:

- `POST https://identity.internal/start`: `{state, redirectUri}` → `{url}`.
  Return the real HTTPS authorisation URL carrying state and the exact callback.
- `POST https://identity.internal/exchange`: `{code, redirectUri}` →
  `{subject, name}`. Verify the real identity provider's code, audience and callback;
  subject must be a stable unique identity. Never trust browser-supplied identity.

The public API creates a ten-minute one-use challenge, verifies it against an
HttpOnly state cookie, consumes it atomically and exchanges the code. A successful
exchange creates a customer-only account and a 24-hour opaque session. D1 stores
only the token hash. Logout revokes the current session. Display names are editable
without changing identity. No password or unverified email authentication is added.

The Account page starts hosted sign-in and handles the provider return. Identity
provider selection and the adapter deployment are required for real customer login.
Without the binding, the API returns 503 with a visible sign-in unavailable state.

## Payments service: PAYMENTS

- `POST https://payments.internal/checkout`, `Idempotency-Key: <orderId>`:
  `{orderId,customerId,amount,currency,title,returnUrl}` → `{id,url}`.
  Amount is server-selected integer minor units. Return a real HTTPS checkout URL.
- `GET https://payments.internal/payments/:id` →
  `{orderId,amount,currency,status}` where status is pending, paid, failed or refunded.
  Verify provider events/transactions inside the trusted adapter. Match the original
  order, amount and currency. Browser returns never prove payment success.

Orders deduplicate by customer/release; the adapter must also deduplicate checkout
creation by orderId across uncertain retries. Free acquisitions become paid at zero
cost locally. Paid orders grant library entitlement only after verified settlement.
Refunds revoke download/review eligibility. Terminal failed/refunded orders require
support; a repurchase flow is not implemented. Partial refunds and chargebacks need
an agreed adapter policy before production commerce is enabled.

A five-minute cron reconciles up to 50 pending/paid provider orders, ordered by the
last check; account checks and download/review requests also reconcile the order.
The adapter owns webhook verification and provider-specific handling. Without it,
paid checkout returns 503; free acquisitions remain available to authenticated users.
Revenue shows paid/refunded amounts separately by currency and retains historical
reported USD portfolio input as a separate measure. There is no inferred currency
conversion or fabricated revenue.

## Download service: DOWNLOADS

`POST https://downloads.internal/grant` receives
`{customerId,releaseId,reference,expiresIn:300}` and returns `{url}`.

Verify the trusted caller, resolve the opaque reference to the private immutable
artifact and issue a real HTTPS download grant valid for at most five minutes.
Enforce the intended user/release scope at the distribution layer. The marketplace
checks session, settled entitlement and release visibility before requesting a
grant, then records download history. Unconfigured downloads return 503. The
artifact store and signed distribution adapter must be deployed before release.

Library users can hide/restore owned products. Owners can write/update one review
per release, with rating 1–5 and text 5–2000 characters. React escapes review text.
Public review submission needs moderation/reporting policy and rate controls before
an unrestricted production launch; this version provides entitlement validation.

## Version-2 product factory

Reusable baseline engines now live in `icvs/engines.ts`; the previous Worker path
re-exports them for existing consumers. MAX-CORE is unchanged.

New runs use:

Idea → Discovery → Specification → Architecture → Simulation → Build → QA →
Package → Governor decision → Ready → Published.

The latest implementation request omits Research; existing specification material
that includes Research remains a future extension, not an implemented stage.
Existing durable runs without `version:2` and adopted legacy Build handoffs retain
v1 completion at Ready. They are never auto-published by this upgrade.

Build and QA retain the original executor evidence and renewable concurrency lease
contracts in `06_ICVS_AUTOMATION.md`. New Package calls use that same trusted
`ICVS_EXECUTOR` binding and `/execute` route with stage `Package`, operationId
`<runId>:Package`, productId, runId, build and qa. Return 202 while pending; otherwise
return the following JSON, derived from the real artifact and approved public copy:

```ts
interface ReleasePackage {
  operationId: string;
  artifact: string; // exactly the QA-verified Build URL
  digest: string;   // exactly the QA-verified SHA-256
  slug: string;    // lowercase alphanumeric words separated by hyphens
  title: string;   // 1–120 characters
  summary: string; // 1–4000 characters, explicitly suitable for public release
  type: "game" | "app" | "art" | "asset" | "media" | "course" | "framework";
  priceMinor: number; // integer 0–100,000,000
  currency: string;   // ISO currency code; provider must support it
  creator: { id: string; slug: string; name: string; bio: string };
}
```

Packaging in this contract supplies metadata for the exact tested artifact. A
transformed binary/archive requires a new build/QA cycle. ICVS validates and stores
an allowlisted package and SHA-256 of its canonical JSON, then creates one immutable
governor gate. Repeated alarms cannot generate replacement approval IDs.

Connect `ICVS_PUBLISHER` to implement:

`POST https://publisher.internal/publish`, idempotency key `<runId>:Publish`, body
`{operationId,productId,runId,package,packageDigest,approvalId}`.

Return 202 while pending, or real correlated evidence:
`{operationId,packageDigest,downloadReference,receipt}`. Receipt is HTTPS; reference
is an opaque identifier understood by DOWNLOADS. Deduplicate effects across retries
and persist the exact result. Never return success before actual publication.

After evidence validation, the existing actor journals Published and atomically
projects the product, event, creator, catalog release and deployment row into D1.
A D1 failure replays that journal without calling the publisher again. Missing
bindings and invalid evidence block visibly with retained retry alarms. Legacy
approval semantics, historical decisions and actor names remain intact.

A target-specific compensation/unpublish adapter is still required for reversing
external releases. This implementation does not claim to undo external downloads
or deployments. Research generation, product-specific architecture generation and
full product simulation also remain external execution responsibilities; the
baseline engines continue to label their brief/lifecycle scope accurately.

## Department intelligence

`portal-os/intelligence.ts` centralises recommendation rules and department
calculations. `DEPARTMENT_CAPACITY` may contain JSON mapping department codes to
non-negative concurrency limits. Absent or invalid capacities are null. Capacity is
reported configuration, not an independent execution scheduler. Global Build/QA
leases remain authoritative for actual concurrency.

All eight departments expose health, configured capacity, current running workload,
backlog, KPIs, seven-day observed stage exits, forecasts and recommendations. Queue
clearance uses queue size / observed exit rate, explicitly labelled as an assumption;
no completion history produces an unavailable forecast. GOV includes pending gates
at Package as well as legacy stages. Quantum XR is added as a managed division.
V2 adds private spatial graph APIs without an XR renderer; see [MAX Universe v2](08_MAX_UNIVERSE_V2.md).

## Validation and release

```sh
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
npx wrangler deploy --dry-run --config wrangler.marketplace.toml
```

Migration 0006 is additive. Apply it before either new Worker is deployed. Preserve
all existing bindings and DO migrations. Build `apps/pages/dist` for the private
Pages project and `apps/marketplace/dist` for the public Pages project. Configure
host-specific Worker routes, exact origins, trusted bindings and secrets separately.
Provider fixtures in tests are synthetic and do not establish production readiness.

Production completion remains dependent on real identity/payment/download/build/
package/publishing adapters, moderation and operational policy, target-specific
compensation adapters (v2 provides rejected-package orchestration), and deployment/domain configuration. No production deployment is
performed by the local implementation or dry-run checks.
