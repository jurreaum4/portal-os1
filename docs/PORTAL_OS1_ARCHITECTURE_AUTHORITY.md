# Portal-OS1 Architecture Authority

## Status and mission

This is the target architecture supplied by the project owner. It establishes
review criteria; it does not certify that the current application implements
every requirement. Identify existing gaps and migrate deliberately. Preserve
unrelated contracts and stored history throughout implementation.

Portal-OS1 is the private operating system for the MAX ecosystem. It manages
MAX Games, MAX Media, MAX Art, MAX Institute and Quantum XR through a Governor
Console, ICVS Command Centre, Portfolio Intelligence Platform, Autonomous Product
Factory and Publishing Platform.

## Architecture and ownership

Governor → Portal-OS1 → ICVS → MAX-CORE → Products.

Portal-OS1 consumes MAX-CORE. Never duplicate its State Engine, Event Bus,
Runtime, Simulation Engine, Storage Engine or Adapter Layer. Product-specific
workflow records and service adapters must use existing primitives and contracts.

| Path | Responsibility |
| --- | --- |
| `apps/pages/**` | Frontend only; consume APIs and present operational data. Keep business policy out of components. Separate marketplace and portal experiences. |
| `apps/worker/**` | API transport, orchestration, governance enforcement, automation scheduling, workflows, bindings and integrations. Preserve auditability and approval rules. |
| `icvs/**` | Reusable workflow automation, lifecycle and approval policy, department operations, and coordination of forecasts and recommendations. |
| `portal-os/**` | Intelligence calculations: analytics, forecasting, recommendations, opportunity detection and risk detection. |
| `max-core/**` | Shared platform-neutral foundation; preserve public interfaces and existing consumers. |

Worker endpoints invoke ICVS policy and Portal Intelligence calculations through
typed interfaces. Ownership of orchestration does not justify copying policy
between layers. Existing Worker-local policies require a tested migration before
moving them; do not create parallel implementations.

## Public and private boundaries

`max.games` contains Games, Apps, Art, Media, Institute, Downloads, User Accounts
and Marketplace. Public catalog browsing is anonymous. Purchases, downloads,
library and account access require an authenticated customer and the appropriate
resource ownership or entitlement. Customer registration never grants portal access.

`portal.max.games` contains Dashboard, Portfolio, Products, Pipeline, Approvals,
Analytics, Forecasting, Recommendations, Revenue, Departments, Publishing, Product
Factory, Runtime Health and Governor Console. Only authorised staff may access it.
Protect operational APIs, telemetry, logs and exports on the server. Never expose
private operational features or ICVS screens through the public application.

Use role-based access control for Governor, Admin, Operator and Read Only staff.
Operators may view operational screens, publishing and analytics, but must not
use governor controls. Governor has full access. Specify the remaining role
permissions explicitly before enabling new privileged operations; default deny.

## Governance and automation

Human product-lifecycle decisions are limited to Approve, Reject and Override.
Other lifecycle operations should be automated. Keep customer commerce actions
separate from product-lifecycle governance. Define identity administration
separately before implementing it; it must not silently expand lifecycle controls.

All decisions require actor identity, permission checks and an audit record.
Overrides require a reason and cannot fabricate execution evidence or bypass
access control. Preserve the immutability of past decisions; reversing an effect
requires a new authorised, linked compensation event rather than editing history.

## ICVS departments

GOV, STRAT, ARCH, BUILD, TEST, OPS, DATA and GROWTH each expose:

- Health and status.
- Capacity and workload.
- Queue and backlog.
- KPIs.
- Forecasts.
- Recommendations.

Report actual measurements with timestamps and sources. Unknown capacity or
missing telemetry is unknown, rather than zero or healthy. Forecasts identify
their assumptions; recommendations identify their evidence and rule or model.

## Product factory

Idea → Discovery → Research → Specification → Architecture → Simulation → Build
→ QA → Package → Ready → Published.

Every transition must be auditable, timestamped, traceable and reversible through
an explicit recovery or compensation operation. Reversibility means restoring
controllable system state while preserving history; external consequences such
as an already downloaded file cannot be erased. Document recovery limits.

Version workflow definitions. Preserve legacy Test, Validation, Live and Archived
records and existing Durable Object identities. Never relabel old evidence as
proof of a newly introduced stage. Governor approval gates and real execution
evidence remain mandatory when extending the lifecycle.

Build, QA, publishing and generation must produce real evidence. Missing executors,
providers or credentials must produce a visible blocked state. Do not fabricate
artifacts, tests, deployments, forecasts or revenue to make automation appear complete.

## Portal Intelligence

Provide forecasts, recommendations, risks, opportunities, product rankings,
portfolio rankings and revenue forecasting. Separate lifecycle completeness
scores from market or quality claims. Keep calculations in shared backend policy;
the frontend displays results and explicit assumptions.

## UI principles

Build Mission Control, Operations Centre and Executive Dashboard experiences.
Avoid Jira-style interfaces, generic admin panels, CRM-style layouts and
unnecessary complexity. Provide accessible loading, empty, blocked, failure and
recovery states. Use British English in user-facing copy and reviews.

## Engineering quality

- Require meaningful tests for changed behaviour and migration boundaries.
- Require types, runtime input validation and deliberate error handling.
- Review secrets and keep credentials out of browsers, logs and public artifacts.
- Check identity, permissions and resource scope on every protected operation.
- Prevent duplicate logic; encourage reuse and preserve layer boundaries.
- Review hot paths, query bounds, retries and resource limits.
- Treat review instructions as criteria; enforce mandatory gates through CI and
  repository protection rather than assuming prose makes them automatic.

## Review checklist

- Does this preserve the separation between Public Marketplace and Portal-OS1?
- Does this avoid duplicating MAX-CORE functionality?
- Does this improve automation?
- Does this improve governance?
- Does this improve portfolio visibility?
- Does this improve forecasting or recommendations?
- Does this maintain auditability?
- Does this maintain role-based access control?
- Does this avoid business logic in UI components?
- Does this protect private operational features from public exposure?

Apply improvement questions to the scope of the change; a focused repair need not
add unrelated functionality. Every change must preserve the relevant guarantees.
