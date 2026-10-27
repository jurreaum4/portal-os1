# ICVS automation iteration

## Short implementation brief

Extend the existing Portal Worker, D1 APIs and Governor Console with audited ICVS automation. Keep MAX-CORE unchanged. Accept and score ideas; generate source-based specifications, architecture packages and heuristic simulations; allocate department work; advance qualified projects through Discovery → Specification → Architecture → Simulation → Build → QA → Ready. Require real execution evidence for Build and QA and governor approval plus worker evidence for publication. Governor actions remain Approve, Reject and Override. Persist every decision and transition, support reversal through compensating workflow generations, and surface lifecycle, workload, risk and recommendations in the existing console. Add no framework or synthetic production data.

## Concrete acceptance criteria

1. An authenticated producer submits a valid idea with a unique `submissionKey`. The API returns 201, persists the idea and score, and records Submitted → Qualified or Rejected. Retrying identical input returns 200 and the same ID; conflicting reuse returns 409.
2. `icvs-v1` scores intake as `round(.35*impact + .30*confidence + .20*(100-effort) + .15*(100-risk))`. Scores below 50 are Rejected without creating a product. Scores at least 50 create exactly one product linked to its idea and optional configured portfolio division.
3. Qualified projects automatically generate immutable discovery, specification, architecture and simulation records attached to project and generation. Specification includes submitted requirements, success metrics and risk rating. Architecture includes declared dependencies, runtime requirements and targets. No guessed requirements or targets are inserted.
4. Simulations persist complexity, risk and forecast scores in 0–100, a 0–1 success probability estimate, the model version and all numerical inputs. The dashboard explicitly labels the output as a heuristic, not a calibrated probability.
5. A project reaches Build automatically. It advances to QA only after a Build worker completes a current lease with an HTTPS evidence reference and SHA-256 digest. QA requires a report reference, digest, non-zero test count and every test passing. It then reaches Ready automatically.
6. Simulation risk at least 70 creates exactly one pending risk request for the current workflow version. Approve or Override resumes Build; Reject pauses it. Override requires the existing 10–1000 character audited reason and cannot bypass execution/QA evidence.
7. Ready creates a publication request. Approval queues publication; it does not assert deployment. A publishing worker must report evidence before the product becomes Published/legacy Live. A GROWTH handoff follows publication. Legacy approval requests retain their original record-intent behaviour.
8. Department capacity atomically limits leased work. Workload means current leases; backlog means queued jobs (GOV reports pending managed requests). Capacity defaults to one slot per department as explicit scheduling policy and may be zero to pause allocation. Lowering capacity does not kill existing work.
9. Work leases expire after five minutes, can be renewed, and are fenced by token, worker identity, active workflow and generation. Expired work is retried automatically up to three attempts; failure/exhaustion creates a governor retry request. Rejection pauses the project; approval explicitly resets the retry budget. No failed work counts as completion.
10. Every workflow transition, idea state, generated artifact, resource allocation/configuration, job result, approval/override, promotion decision and runner processing failure has a timestamped D1 audit event. State and audit writes commit together; audit records and generated artifacts cannot be edited/deleted through the application.
11. A producer can request an earlier stage using the current workflow version and a reason. Governor approval starts a new generation, preserves original history and valid earlier prerequisites, and fences old in-flight work. Published reversal first queues external publication compensation; only evidence of compensation allows the state to move back. Reversal never erases or claims to undo an external side effect by changing a label.
12. The existing console displays current managed stage (QA maps to existing Test), simulation results, classifications, next action, resource counts and project audit history. Missing financial/health observations remain unknown. Archive is a reversible management classification, not deletion.
13. Scheduled execution resumes committed work after restarts; duplicate/concurrent runners cannot duplicate products, generation artifacts, jobs or gate application. A failing project does not block other projects in its page.
14. Existing API tests, all MAX-CORE tests and type checks pass. MAX-CORE has no changes. Worker build/dry-run, D1 upgrade and shared-browser desktop/mobile checks pass.

## D1 schema checklist

Migration: `apps/worker/d1/migrations/0004_automation.sql`, applied after 0001–0003. No legacy table is replaced. No demo ideas, products or observations are seeded.

| Table | Purpose / guarantees |
| --- | --- |
| `ideas` | Submitted/Qualified/Rejected, bounded source inputs, score, unique submission key/hash, linked product and division |
| `automation_workflows` | One per product/idea; stage/status, generation, optimistic version, unique last operation, reason and timestamp |
| `automation_artifacts` | Discovery/specification/architecture/simulation JSON; unique product/generation/kind; immutable, model/version provenance |
| `automation_resources` | Eight departments with configured capacity 0–100; initial scheduling policy audited |
| `automation_jobs` | Department allocation, unique generation/stage, attempts, worker/lease, result evidence and timestamps |
| `automation_gates` | Links existing approvals to expected workflow version, purpose (risk/retry/publish/reverse), target and application state |
| `automation_promotions` | Archive/Maintain/Improve/Promote, explicit reason, inputs, policy version, last change |
| `automation_events` | Append-only timestamped event ledger; indexed per product; D1 triggers couple audit and mutations |
| `automation_scheduler` | Internal rotating cursor for bounded scheduled pages; no business state |

Schema gates:

- [x] Preserve legacy product stages and approval statuses.
- [x] Keep governor decisions in the existing immutable ledger; also project them into automation audit.
- [x] Use foreign keys, unique constraints, checks, parameterised values and D1 transactions.
- [x] Index department queues and project audit reads.
- [x] Retain old artifact generations, job evidence and transition history on reversal.
- [x] No MAX-CORE schema, storage implementation or runtime is duplicated.

## API checklist

Existing CORS and `Cache-Control: no-store` handling apply. Existing GET APIs and response fields remain compatible. Reads retain the deployment's existing public-read contract; use its Cloudflare Access configuration for private deployments.

| Method / path | Caller | Contract |
| --- | --- | --- |
| `GET /api/ideas` | Existing read policy | Latest 100 intake summaries |
| `POST /api/ideas` | Integration bearer token | Validated intake, idempotent submission; 201 new / 200 retry / 409 conflict |
| `GET /api/automation` | Existing read policy | Idea counts, latest 100 workflows/simulations/classifications/events, all department counts |
| `GET /api/automation/projects/:id` | Existing read policy | Workflow, all generation artifacts/jobs and latest 200 project events; lease tokens excluded |
| `POST /api/automation/run` | Integration bearer token | Run a bounded scheduler page; returns processed/errors |
| `GET /api/automation/jobs` | Integration bearer token | Latest 100 claimable external-work candidates; a claim may still return capacity conflict |
| `POST /api/automation/jobs/:id/claim` | Integration bearer token | `{workerId}`; atomically leases external work, returns lease token, workflow, planning packages, prior work and gate context |
| `POST /api/automation/jobs/:id/heartbeat` | Integration bearer token | `{workerId,leaseToken}`; renew current lease for five minutes; expired/superseded → 409 |
| `POST /api/automation/jobs/:id/complete` | Integration bearer token | `{workerId,leaseToken,outcome,summary,evidenceUrl,sha256}`; `outcome`: succeeded/failed. Successful QA also requires `{totalTests,passedTests,buildSha256}`; Publish requires `buildSha256`. Failed work needs summary but no success evidence |
| `POST /api/automation/resources` | Integration bearer token | `{department,capacity}`; audited capacity policy change, then scheduler wake-up |
| `POST /api/automation/projects/:id/reversal` | Integration bearer token | `{expectedVersion,targetStage,reason}`; request only, creates existing governor approval; earlier stages only |
| `POST /api/approvals/:id/approve` | Existing governor token | Existing pending-only decision; managed gate automatically consumed |
| `POST /api/approvals/:id/reject` | Existing governor token | Existing decision; managed workflow pauses and releases queued/leased work |
| `POST /api/approvals/:id/override` | Existing governor token | Existing reason requirement; managed gate can resume, evidence requirements remain |
| `GET /api/system-health` | Existing read policy | Existing infrastructure checks plus observed D1 automation queue counts; failed/expired current-generation jobs degrade queue health. Worker liveness is not inferred |
| `GET /api/console` | Existing read policy | Managed workflow owns factory stage; latest telemetry cannot jump managed projects past automation gates |

Write validation: 32 KiB bodies, bounded strings/lists, finite metric targets, integer scoring inputs 0–100, known division/department/stages. Wrong credentials → 401, missing integration configuration → 503, invalid input → 400, missing project/job → 404, concurrency/lease/idempotency conflict → 409, oversized body → 413, unsupported method → 405. Integration routes reuse `OBSERVATION_API_TOKEN`; this token must never reach the browser. Governor credentials cannot submit ideas or complete execution jobs.

### Intake body

Required fields: `submissionKey`, `title`, `problem`, `audience`, `requirements` (1–30 strings), `successMetrics` (1–30 `{name,target,unit}` objects), `dependencies` (0–30 strings), `platformTargets` and `runtimeRequirements` (1–30 strings each), `impact`, `confidence`, `effort`, `risk`, `source`. Optional: `unitId` from configured portfolio units. Clients must send real source data; no product-specific routing is embedded in the engine.

### Execution worker obligations

Workers poll candidates, claim work, perform the real operation, renew leases during long runs, and report results. Use the **job ID** as the external idempotency key and reconcile existing side effects before retrying. Lease fencing prevents a late callback from advancing D1; it cannot cancel a deployment already running in another system. Evidence references/digests are authenticated worker attestations; Portal does not download arbitrary URLs or independently run untrusted builds. QA and Publish results must reference the SHA-256 of the successful Build supplied in `priorWork`. A QA worker must test that exact artifact. Compensate workers must undo the prior publication and return their report before reversal completes.

The existing repository contains no arbitrary-product builder, QA farm, publisher or compensation adapter. This iteration implements their durable work contract; it cannot manufacture those external capabilities. With no executor connected, Build stays queued with a truthful backlog. This limitation does not produce a governor request until work fails/exhausts retries: the Governor is not asked to perform ordinary work.

### Versioned policies

Simulation complexity = `round(.6*effort + .4*min(100, 5*requirements + 10*dependencies + 10*targets))`.
Risk = `round(.6*risk + .25*(100-confidence) + .15*complexity)`.
Forecast = `round(.4*impact + .35*confidence + .25*(100-complexity))`.
Success probability = rounded-to-two-decimals `(.6*forecast + .4*(100-risk))/100`.

Promotion: paused → Archive; fresh health below 60 → Improve; score ≥80, fresh health ≥80, forecast ≥70 and Ready/Published → Promote; forecast below 50 → Improve; otherwise Maintain. Health older than 24 hours is excluded. Classifications do not silently archive or publish products. The Worker stores the policy version, inputs, next action, opportunities and risks for each changed decision. The existing console recommendations and forecast widgets consume these stored signals; source-reported forecasts take precedence over heuristic simulation outlooks.

## Startup and deployment

Use existing commands: `npm run db:migrate:local`, `npm run dev:worker`, `npm run dev:pages`. Wrangler emulates D1/Durable Objects locally. No provider emulator is required: the engine has no external API client. Local scheduled testing can use Wrangler's scheduled trigger or the authenticated run endpoint. Deployment adds a once-per-minute Cron Trigger to the **existing Worker**; run migration 0004 before deploying this Worker revision. Five projects across all lifecycle states are processed per rotating scheduled page (including refreshing promotion decisions for paused/completed projects), at most ten transitions each; 25 Submitted ideas are qualified per run. D1 is the durable work source, so no in-memory queue is relied on.

Run `npm run typecheck`, `npm test`, `npm run build`, `npx wrangler deploy --dry-run`. Production secrets and real execution workers must be configured by the deployment owner. No remote migration or deployment is implied by local validation.
