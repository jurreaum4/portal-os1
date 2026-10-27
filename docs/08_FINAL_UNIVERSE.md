# Final Universe extension

This extends the existing Worker, React interface, D1 and ProductFactoryActor. MAX-CORE is unchanged. No new framework, database, actor namespace, synthetic operational data or duplicate commerce/analytics engine is introduced.

## Layer boundaries

- **ICV** resolves personal principals and existing service credentials.
- **BEMAX** queries the existing intelligence projection; it has no execution or approval authority.
- **MANIFOLD** is the existing Universe graph, twins, topology and relationship APIs.
- **Portal-OS1** presents the Governor console and public Marketplace.
- **MAX-CORE** retains execution primitives; real product executors connect through the existing ICVS executor binding.
- **ICVS** owns progression, checkpoints, compensation and governance in Durable Objects, with lifecycle/audit projections in D1.

## Migration and compatibility

Apply `npm run db:migrate:local` for local development. Migration 0007 activates `icvs-v3-final` with Package between QA and Ready. Existing actors remain pinned to v2/v3, and historical stages, events and final decisions are retained. Multiple approval records can now belong to a run after a reversal. Divisions and workflow steps remain D1 configuration. Marketplace publication and BEMAX readiness resolve configured engine stages, including retained workflow versions.

The original v2 contract made Ready terminal, while v3 authorized publication after approval. Neither changes for pinned runs. New final-version runs require verified packaging **before** the Governor decision. Package evidence must match the Build digest and contain a passing `package` check with an HTTPS report. The same envelope and `/execute` integration used for Build/QA/Publish is reused. Package requests include Build and QA evidence; publication includes Package evidence.

## ICV identity

`GET /api/icv/me` returns `{id,name,role}`. Trusted identity administration provisions D1 `icv_principals` with a stable ID, name, role, and lowercase hexadecimal SHA-256 of a high-entropy bearer token. Store only the hash. Roles are `member`, `viewer`, `automation`, `governor`. IDs beginning `service:` are reserved. Set `disabled=1` to revoke access immediately. There is deliberately no public role-assignment endpoint.

Existing environment service tokens keep their original roles. Their audit labels remain `governor` and `automation` for compatibility; personal principals use their IDs. Members can access their Marketplace account but cannot access Universe data or decisions. Viewer and automation principals cannot approve or reverse. Service credentials cannot own Marketplace libraries.

Token entry in Settings stays in tab memory and clears on reload. Production identity issuance/SSO must be supplied by the actual ICV identity system; this repository contains credential resolution and revocation, not an identity provider.

## BEMAX

`POST /api/bemax/query` with `{ "question": "Show me risks." }` requires Universe access. It returns an intent, answer, observed timestamp, linked evidence items and integration limitations. The Governor console keeps a bounded conversation in memory and clears it when access changes.

Supported intents cover opportunities, risks, next actions, publishing, divisions, departments, forecasts and named-entity navigation. Answers reuse the existing graph, recommendations and forecast scenarios. Unknown telemetry stays unknown. Questions never execute a product operation or create approval decisions.

**Current language capability:** deterministic intent routing, not a generative personal AI or an LLM. No model provider exists in this repository. Arbitrary reasoning and conversational follow-up interpretation require a real BEMAX model integration. Revenue scenarios and history are the existing intelligence outputs, not new predictive models.

## Reversible progression

`POST /api/factory/:productId/override` accepts:

```json
{"eventId":"<runId>:<sequence>","expectedSequence":42,"reason":"Restore the earlier checkpoint for a verified correction"}
```

Only Governor identities may submit this action. `expectedSequence` must match the current actor journal. The target must belong to this run and have a checkpoint. Audit-only Workflow/Resource Allocation/Reversal entries are not reversal targets. New lifecycle transitions store their prior workflow checkpoint atomically with the DO journal. Pre-upgrade transitions without checkpoints return 409 rather than reconstructing unverified execution state.

The request persists a reversal operation in the DO and returns 202. If any executed Build, QA, Package or Publish effects occurred since that checkpoint, ICVS calls the existing executor at `/compensate` with a stable operation ID, ordered affected events, current artifact evidence and target stage. Return 202 while pending. A successful response uses the existing ExecutionEvidence envelope, matches the current Build digest, and includes a passing `compensation` check with an HTTPS report attesting that all listed effects have been compensated. Missing support, failure or invalid evidence cannot advance restoration. Retried requests must be idempotent at the executor.

Once verified, ICVS restores the checkpoint through a new `Reversal` event containing the original event ID, actor, reason, timestamp and compensation evidence. Final decisions stay immutable; pending requests are superseded explicitly. D1 projection failures replay the journal. Automation **resumes immediately** from the restored stage; this is not a pause or unpublish-and-hold command. Re-execution uses a new operation epoch so a provider cannot replay an old completed action. Historical deployment records remain evidence of earlier events.

The product detail page exposes this through **Override lifecycle**, alongside the existing audit trail. There is no new Governor action type.

## Public Marketplace and real commerce

`/marketplace` exposes the configured published catalog and division filters without credentials. `GET /api/marketplace/catalog` returns published product descriptions, configured divisions and commerce availability. Draft products and operational revenue are excluded.

The optional `MAX_MARKETPLACE` Worker service binding delegates commerce to the actual MAX Marketplace. It does not implement or simulate billing, ownership or delivery:

| Portal endpoint | Provider endpoint | Contract |
| --- | --- | --- |
| GET `/api/marketplace/library` | GET `/library` | Current subject's `[{id,name,status?}]` |
| GET `/api/marketplace/purchases` | GET `/purchases` | Current subject's `[{id,name,status?}]` |
| GET `/api/marketplace/creators` | GET `/creators` | `[{id,name,status?}]` |
| POST `/api/marketplace/checkout` | POST `/checkout` | `{productId}` → `{url}` HTTPS checkout |
| POST `/api/marketplace/download` | POST `/download` | `{productId}` → `{url}` HTTPS authorized download |

All account operations require a personal ICV identity. Portal sets `X-ICV-Subject` from the authenticated identity, discards caller-supplied identity headers and never forwards the bearer credential. Write requests require `{productId,idempotencyKey}` and published catalog membership. Provider idempotency keys are subject-scoped. The provider must authorize ownership before download, verify purchases independently, and audit commerce in its existing system. Browser checkout redirects do not prove payment success.

No binding means 503 for account operations and visibly unavailable checkout/downloads. No fake receipts or entitlements are stored. Add the actual service binding in deployment configuration only when that service exists; no placeholder remote service is configured here.

## Remaining live integrations

No real execution, compensation, Marketplace commerce, sports/competitive data feed or generative BEMAX provider is included in this repository. The new integration contracts are validated with isolated test fixtures; Preview reads the actual local D1 database without seeding products or measurements. Sports modules, digital twins and XR topology retain the existing configurable graph and authenticated observation integration. A completed code build does not establish live autonomy, live commerce or predictive intelligence. Remote migration and deployment are separate operations.
