# ICVS automation layer

This document describes the retained v1 workflow and Build/QA executor contract.
New runs use the [version-2 package and publication extension](07_MAX_ECOSYSTEM.md).
All operational reads now require staff access. Existing durable v1 runs retain
their Ready completion semantics.

ICVS coordinates products using the existing Worker, D1 binding, `ProductFactoryActor`, dashboard and governor API. MAX-CORE is unchanged. The Simulation engine imports its existing deterministic Simulation primitive; it does not implement a second runtime, scheduler or storage abstraction.

## Lifecycle and engines

Idea → Discovery → Specification → Architecture → Simulation → Build → QA → Ready.

- **Idea Intake:** validates the submitted name, brief and division through `/api/intake`; schedules automation immediately. The existing run endpoint remains an idempotent compatibility entry point.
- **Workflow:** the existing per-product actor advances one stage per durable alarm. A one-minute scheduled reconciliation starts committed ideas missed by an interrupted intake call and pre-upgrade ideas. Existing planning runs blocked at Build are adopted using their original run IDs; prior outputs are preserved. No governor action is required to run engines.
- **Specification:** records the submitted brief as requirement `brief` and defines immutable artifact and requirement-linked QA acceptance evidence. It does not invent requirements or claim AI-generated specifications.
- **Architecture:** records the existing Worker/DO/D1 orchestration boundaries and executor handoff. Product-specific implementation is the executor's responsibility.
- **Simulation:** uses MAX-CORE to check deterministic lifecycle reachability. This is a workflow model, not a simulation of an unbuilt product.
- **Resource Allocation:** a portfolio instance of the existing factory actor grants bounded execution leases, default two slots. `ICVS_EXECUTION_SLOTS` accepts integers 1–100. Leases expire after 60 seconds, refresh on retries, and release after completed evidence. Allocation is audited per execution stage. Contenders retry every 30 seconds; scheduling does not guarantee priority or FIFO fairness.
- **Project Scoring:** computes 0–100 lifecycle evidence completeness, recorded with each transition. It is explicitly not market validation, revenue prediction or product quality scoring. Archived projects score zero; existing products outside automation retain their recorded scores.
- **Promotion:** requires successful build and matching QA evidence, then creates one request in the existing approval queue. Approve or Override makes the project Ready. Override requires the existing reason and cannot bypass missing execution evidence. No publication occurs.
- **Archive:** Reject archives the project and retains all outputs, decisions and events. Final decisions remain immutable.

Existing Test, Package, Validation, Published, Live and Archived records remain readable. Automated runs use QA, and do not go through legacy Test or Package. Old non-ICVS approvals keep their existing semantics.

## Durable state and recovery

The actor stores the full workflow snapshot, execution evidence, approval identity, decision, sequence and pending projection journal in Durable Object storage. Portfolio allocation leases also live in Durable Object storage. D1 stores the lifecycle projection, factory outputs, scores, approvals and append-only transition history.

Each transition first commits a deterministic event ID and resulting snapshot to DO storage. A D1 batch atomically projects the product, run, artifacts, score, activity, approval and event. Idempotent inserts make replay safe if execution stops after the batch commits but before the journal is cleared. A durable alarm is armed before work begins. Pending projections are replayed before further advancement or governor decisions. No cross-service transaction is claimed: D1 can temporarily lag the DO journal while unavailable.

Errors block visibly and retry every 30 seconds. Repeated identical blockers do not generate duplicate events. A governor gate stops alarms until a decision arrives. Completed runs stop alarms. Executor operations use stable run/stage idempotency keys and must tolerate ambiguous response delivery and retries.

`GET /api/factory` shows status, stage and blocker messages. Existing products, pipeline, portfolio, analytics and department APIs reflect persisted lifecycle state. `GET /api/factory/:productId/outputs` includes engine outputs and score explanations. `GET /api/factory/:productId/transitions` adds the complete ordered per-run audit trail: sequence, source/target stages, engine, actor, reason, evidence and timestamp. The existing product page displays this history and refreshes every 15 seconds. Read APIs require staff authorisation.

## Real execution integration

The repository has no build service, QA service, source-repository execution interface or artifact store. ICVS never manufactures successful builds, test reports or deployments. Without an executor it advances to Build and reports the missing binding. No external provider credentials, production records or mock data are included.

Connect a trusted Cloudflare Worker through the optional `ICVS_EXECUTOR` service binding when a real executor exists. Do not point this binding at an arbitrary user-supplied URL. The binding is not configured to a nonexistent service by default. Add the service declaration for your actual worker during deployment:

```toml
[[services]]
binding = "ICVS_EXECUTOR"
service = "YOUR_EXISTING_EXECUTOR_WORKER"
```

ICVS sends `POST https://executor.internal/execute`, `Content-Type: application/json` and `Idempotency-Key: <runId>:<Build|QA>`. The JSON body contains `operationId`, `leaseExpiresAt` (epoch milliseconds), `productId`, `runId`, `stage`, `specification`, `architecture` and, for QA, `build` evidence.

Executor contract:

1. Deduplicate by operationId across retries and actor restarts. Return the same result for a completed operation.
2. Return 202 while work is pending. Polling occurs every 30 seconds. Honor the renewable `leaseExpiresAt`: pause work when the lease expires, and resume only on renewal. This is necessary to enforce the portfolio concurrency bound for asynchronous jobs.
3. Complete within the 20-second request timeout or return 202; perform long jobs outside the request.
4. Return 200 with the following real evidence, obtained from the actual build/QA system:

```ts
interface ExecutionEvidence {
  operationId: string;
  artifact: string; // HTTPS artifact URL, <= 2000 URL characters
  digest: string; // lowercase SHA-256, 64 hex characters
  checks: { requirement: string; passed: boolean; report: string }[];
}
```

QA must identify exactly the Build artifact URL and digest. It must include a passing `brief` requirement with an HTTPS report URL, and no failed checks. Evidence is accepted only from the trusted service binding, never from the public browser. The executor is responsible for actually hashing the artifact, running QA, retaining reports and verifying the product-specific requirements; ICVS validates the evidence contract and correlation. A failing/invalid response blocks promotion and is retried. No public endpoint accepts arbitrary success reports.

## Deployment and validation

Apply migration 0005 before deploying the Worker. It adds QA while preserving all product-dependent tables and their rows, then adds audit and workflow/approval mapping tables. Existing Durable Object bindings and migrations are unchanged. The Worker adds a one-minute cron trigger for intake reconciliation. Deploying that trigger will start eligible existing ideas and legacy Build handoffs automatically.

Use the repository's typecheck, tests, build and Wrangler dry-run commands. Integration tests use isolated local D1/DO state and test-only executor fixtures; these never populate the application database. Actual end-to-end product builds remain dependent on the real executor integration.
