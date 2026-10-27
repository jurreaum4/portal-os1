-- Configuration only: no fabricated products, revenue or operational observations.
CREATE TABLE portfolio_units (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
INSERT INTO portfolio_units VALUES
 ('games','MAX Games'),('media','MAX Media'),('art','MAX Art'),
 ('institute','MAX Institute'),('xr','Quantum XR');
ALTER TABLE products ADD COLUMN unit_id TEXT REFERENCES portfolio_units(id);

-- Latest observations supplied by trusted system integrations. NULL means unknown.
CREATE TABLE product_observations (
 product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
 workflow_stage TEXT CHECK(workflow_stage IN ('Idea','Discovery','Specification','Architecture','Simulation','Build','Test','Package','Ready','Published')),
 status TEXT CHECK(status IN ('queued','running','blocked','complete')),
 health REAL CHECK(health BETWEEN 0 AND 100),
 revenue_minor INTEGER CHECK(revenue_minor >= 0),
 currency TEXT CHECK(length(currency) = 3 AND currency GLOB '[A-Z][A-Z][A-Z]'),
 revenue_period TEXT,
 forecast TEXT,
 forecast_due_at TEXT,
 source TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 CHECK(revenue_minor IS NULL OR (currency IS NOT NULL AND revenue_period IS NOT NULL))
);
CREATE TABLE department_observations (
 department TEXT PRIMARY KEY CHECK(department IN ('GOV','STRAT','ARCH','BUILD','TEST','OPS','DATA','GROWTH')),
 health REAL CHECK(health BETWEEN 0 AND 100),
 status TEXT NOT NULL,
 queue INTEGER CHECK(queue >= 0),
 current_work TEXT,
 kpi_name TEXT,
 kpi_value TEXT,
 source TEXT NOT NULL,
 observed_at TEXT NOT NULL
);
-- Preserve the pending-only decision invariant and existing status values.
-- An override approves a pending request with an explicit, immutable reason.
ALTER TABLE approvals ADD COLUMN decision_kind TEXT CHECK(decision_kind IN ('approve','reject','override'));
ALTER TABLE approvals ADD COLUMN decision_reason TEXT;
CREATE TABLE governor_decisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 approval_id TEXT NOT NULL REFERENCES approvals(id),
 action TEXT NOT NULL CHECK(action IN ('approve','reject','override')),
 reason TEXT,
 decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER record_governor_decision AFTER UPDATE OF status ON approvals
WHEN OLD.status = 'pending' AND NEW.status != 'pending'
BEGIN
 INSERT INTO governor_decisions (approval_id,action,reason)
 VALUES (NEW.id,COALESCE(NEW.decision_kind,CASE NEW.status WHEN 'approved' THEN 'approve' ELSE 'reject' END),NEW.decision_reason);
END;
CREATE TRIGGER immutable_governor_decision_update BEFORE UPDATE ON governor_decisions
BEGIN SELECT RAISE(ABORT, 'Governor decisions are immutable'); END;
CREATE TRIGGER immutable_governor_decision_delete BEFORE DELETE ON governor_decisions
BEGIN SELECT RAISE(ABORT, 'Governor decisions are immutable'); END;
