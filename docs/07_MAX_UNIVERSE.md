# MAX Universe v3

MAX Universe extends the existing Portal-OS1 Worker, dashboard, D1 database and ProductFactoryActor. MAX-CORE is unchanged. There are no new frameworks, dependencies, Durable Object namespaces or provider credentials in the patch.

## Surfaces

| Route | Purpose |
| --- | --- |
| `/portal/universe` | Connected ecosystem, operational health, revenue, division forecasts and recommendations |
| `/portal/universe/galaxy` | Selectable division planets, orbiting product/project nodes, dependency links, search, division filter, zoom, metric sizing and status coloring |
| `/portal/universe/products` | Products, shared assets/services/runtime components, dependencies and lifecycle rankings |
| `/portal/universe/pipeline` | Configured lifecycle queues, flags, observed stage durations and queue estimates |
| `/portal/universe/departments` | Configured department capacity, workload, backlog, completed projects, health and queue estimates |
| `/portal/universe/sports` | Sports hierarchy, nine registered intelligence modules, source-linked athlete/team observations |
| `/portal/universe/marketplace` | Product/creator revenue, sales, downloads, engagement and health observations |
| `/portal/universe/quantum` | Quantum XR subtree and its operational twins |
| `/portal/governor` | Ecosystem status, risks, scenarios, recommendations and existing Approve / Reject / Override controls |

These routes extend the existing shell. Existing URLs remain available. SVG graph nodes support keyboard selection; an accessible button list provides the same selection behavior. No XR renderer is required.

## Data ownership and taxonomy

`divisions`, `products`, `factory_runs`, `workflow_events`, `approvals` and existing intelligence endpoints remain authoritative. Native twins are derived from those records rather than duplicating products or analytics. Factory runs are the project's operational twins; integrations can additionally register external project entities.

Migration 0006 registers the requested MAX Apps, MAX Sports and Quantum XR divisions alongside the existing four divisions, plus the eight Sports subdivisions and nine Sports module names. These are taxonomy records, not mock revenue, users, products or health data. Future divisions come from D1 and appear without UI changes. `parent_id` and `category` control hierarchy and room membership.

`department_config` stores department names, assigned stages and optional capacity. Capacity defaults to unknown. `lifecycle_stages` stores registered stage names and display ordering. `workflow_definitions` stores versioned JSON engine sequences; one definition is active for new runs. Manage configuration using reviewed D1 migrations; do not edit a definition already in use—insert a new ID and change the active pointer. An actor pins its definition in DO storage when a run begins. Stage names can change without changing the generic orchestration engine, provided they are registered. Engine handlers and mandatory Build → QA → Ready evidence guards are code contracts, not user-defined executable code.

## Security

Configure distinct secrets:

| Credential | Permissions |
| --- | --- |
| `UNIVERSE_VIEWER_TOKEN` | Read Universe graphs, twins, intelligence and audit history |
| `UNIVERSE_AUTOMATION_TOKEN` | Read Universe, ingest/retract/restore integration records, use existing intake/division/factory APIs |
| `GOVERNOR_API_TOKEN` | Read Universe and make existing governor decisions; legacy v2 management APIs retain compatibility |

Send `Authorization: Bearer <credential>`. Missing/invalid Universe credentials return 401; ingestion by viewers or governors returns 403. Governor decisions still require the governor secret, so an automation or viewer credential cannot approve itself. The Universe governor view presents read-only status to viewers. Credentials stay in browser memory and clear on reload. Do not use browser credentials for integration ingestion or put secrets in `VITE_` variables.

Roles are service credentials, not individual user identity or an identity-provider integration. Legacy public read endpoints and kernel authorization are unchanged. If deployment-wide confidentiality is required, retain the existing perimeter access control as well.

## Graph, twins and XR APIs

All endpoints below require a Universe role. The existing operational APIs keep their contracts.

- `GET /api/universe`: full graph, twins, summary, pipeline, department workload, recommendations, opportunities, integration coverage and methodology.
- `GET /api/universe/graph`, `/galaxy`, `/products`, `/sports`, `/quantum`, `/marketplace`: graph representations, with room-specific node filtering where applicable.
- `GET /api/universe/twins?id=<encoded node ID>`: one twin (404 if absent); omit ID for all twins.
- `GET /api/universe/relationships`: typed, sourced containment, dependency, shared-use, creator, distribution and competitive edges.
- `GET /api/universe/pipeline`, `/departments`: operational projections.
- `GET /api/universe/intelligence`: existing recommendations plus risk propagation, lifecycle opportunities, division/ecosystem summaries, capacity priorities, recorded trends and side-by-side competitive observations.
- `GET /api/universe/spatial?room=galaxy|products|pipeline|departments|sports|quantum`: portable JSON topology with stable entity IDs, deterministic coordinates, relationships, source timestamps and interaction metadata. Coordinates are right-handed, Y-up, in abstract `layout-unit`s (not physical meters). Every edge in a filtered spatial response resolves to two included nodes. Layout may reposition siblings when topology changes; IDs remain stable.
- `GET /api/universe/events?id=<record ID>`: ordered integration revision/audit history.

Native IDs use `ecosystem:max`, `division:<id>`, `product:<id>`, `project:<run id>` and `department:<id>`. External entity IDs start with `external:`. Native facts remain in their original tables.

## Automated integration ingestion and reversal

An integration submits `POST /api/universe/events` using the automation credential. The existing actor class uses a dedicated actor instance to serialize ingestion; each D1 batch atomically writes an append-only event and its current projection. No workflow state is moved out of Durable Objects.

Envelope (maximum 32 KiB):

```ts
interface UniverseEvent {
  eventId: string;              // stable delivery ID, up to 120 characters
  id: string;                   // stable record ID, up to 120 characters
  kind: 'entity' | 'relationship' | 'observation';
  expectedRevision: number;      // zero for first write
  source: string;                // actual integration/provider identity
  reason: string;                // 10–1000 characters
  deleted: boolean;             // tombstone; never deletes audit history
  data: Record<string, unknown>;
}
```

Data shapes:

```ts
// kind: entity
{ name, kind, parentId?, category?, status? }
// kind is asset, service, runtime, creator, competitor, athlete, team or project.
// parentId must exist; containment cycles are rejected.

// kind: relationship
{ from, to, type }
// Both endpoints must exist. Types: depends_on, uses, creates,
// distributes, competes_with. Native containment is derived automatically.

// kind: observation
{ entityId, observedAt, currency: 'USD', moduleId?, metrics }
// UTC timestamp, not more than one minute in the future; entity and optional
// Sports module must exist. Numeric metrics are finite and nonnegative.
```

Supported metrics: revenue, users, impact, downloads, sales, engagement, health (0–100), capacity, throughput, injuries, wins, losses, draftRank, scoutingScore, simulationRuns, valuation, mediaReach, marketInterest. Metrics are supplied observations, not inferred medical, sporting or financial predictions. Providers must document units and comparable measurement windows. Product monthly revenue remains authoritative in `products`; marketplace sales are separate and are never added to that revenue total.

Replaying an identical event ID/content returns 200 with `reused:true`; new events return 201. Changed content under the same event ID or stale revisions returns 409. An unchanged expected revision cannot silently overwrite concurrent updates. Invalid inputs return 400; oversized bodies return 413. Timestamps determine latest observed values, so late deliveries do not overwrite newer metrics.

To retract an integration record, send a new event ID, its current revision and `deleted:true`. To restore it or undo an incorrect update, send another event with the latest revision, `deleted:false` and the desired prior data from its audit history. The old event is never rewritten. Deleted parents do not delete their children; retained children are visibly flagged as having an unavailable parent. Workflow Archive also retains outputs and decisions. Reversing an external publication requires the real publisher's compensating operation; this layer does not claim it can undo a provider side effect without that integration.

## Intelligence semantics

- Health aggregates recorded operational flags and supplied health observations; it is not a live availability SLA. Unknown health/usage/impact stay null.
- Risk includes local flags and dependency propagation, including multi-hop dependencies.
- Forecasts reuse one shared v2 revenue scenario calculation: −5%, current baseline, +10%. They are disclosed scenarios, not learned predictions.
- Stage duration/queue estimates use recorded transition timestamps and require at least three completed samples. Project completion estimates remain unknown when required samples or execution availability are missing.
- Department capacity is an observed/configured input; utilization cannot be inferred without it. Department history charts use health observations.
- Daily snapshots are captured automatically by the existing scheduled handler, independently of intake reconciliation. Repeated captures on the same day are idempotent. The API shows the most recent 30 days; audit records are retained.
- Growth compares recorded current revenue against the last stored daily sample. Rankings reuse lifecycle completeness scores. Opportunities and strategic priorities are explainable rules, not market guarantees.
- Competitive intelligence compares explicitly linked, sourced competitor twins. No external market-share or competitor feed is invented.

## ICVS v3 behavior and compatibility

New runs pin `icvs-v3`: Idea → Discovery → Research → Specification → Architecture → Simulation → Build → QA → Ready → Published. Research gathers connected observations for the product and records when only the submitted brief exists. Specification, architecture and MAX-CORE simulation retain their existing scope.

After real Build and QA evidence matches, ICVS creates a governor request. Reject archives; Approve or Override authorizes automatic publication of that verified artifact for a v3 run. Publishing uses the existing optional `ICVS_EXECUTOR` binding and stable `<runId>:Publish` idempotency key. The payload includes stage, build, QA and the recorded decision. Return 202 while pending, or 200 with the existing ExecutionEvidence shape and a digest matching the approved build. Failed checks, mismatched digests, errors or an absent executor leave the project visibly blocked at Ready. Only verified success records Published and deployment telemetry in the same replayable D1 projection.

This intentionally extends v2's “Ready is terminal; approval does not publish” contract. Existing actors without a pinned definition load `icvs-v2`; v2 remains terminal at Ready. Existing approval decisions stay final. Legacy stages remain registered and visible. The original v2 integration tests run against the preserved v2 definition; separate v3 tests verify Research, version pinning, publishing and rejected publication evidence.

## Deployment and real integration limits

Apply migration 0006 before deploying the Worker. It transactionally rebuilds product-dependent tables to replace the hardcoded stage check with a stage registry reference, preserving products, runs, outputs, approvals, workflow audit events, approval mappings and deployment records. It also registers taxonomy/configuration and creates integration event/projection/history tables. No new DO migration is needed.

The repository does not contain an actual MAX Marketplace API client, sports/competitive feed, publishing provider or product build/QA executor. Connect those real services through the ingestion contract and the existing executor binding. Until then, the UI shows real registered taxonomy and existing operational data, with unknown telemetry and explicit integration status. It does not simulate a populated ecosystem. No remote migration or deployment is performed by local verification.

Local startup remains `npm run db:migrate:local`, `npm run dev:worker`, and `npm run dev:pages`. Enter a local viewer credential in Settings to inspect Universe routes. Use existing typechecks, Worker tests, Pages build and Wrangler dry-run. Tests use isolated D1/DO fixtures, never application seed data.
