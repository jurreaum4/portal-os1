PRAGMA defer_foreign_keys = ON;
CREATE TABLE products_icvs (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 stage TEXT NOT NULL CHECK(stage IN ('Idea','Discovery','Specification','Architecture','Simulation','Build','QA','Test','Package','Ready','Published','Validation','Live','Archived')),
 score INTEGER NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 division_id TEXT NOT NULL DEFAULT 'max-games' REFERENCES divisions(id),
 revenue REAL NOT NULL DEFAULT 0 CHECK(revenue >= 0),
 status TEXT NOT NULL DEFAULT 'On track' CHECK(status IN ('On track','Attention','Paused'))
);
INSERT INTO products_icvs SELECT * FROM products;
-- Rebuild references as well: D1 enforces foreign keys during table replacement.
CREATE TABLE approvals_icvs (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products_icvs(id), action TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN ('High','Medium','Low')), risk TEXT NOT NULL CHECK(risk IN ('High','Medium','Low')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','overridden')),
 decided_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decision_note TEXT NOT NULL DEFAULT ''
);
INSERT INTO approvals_icvs SELECT * FROM approvals;
CREATE TABLE factory_runs_icvs (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products_icvs(id),
 status TEXT NOT NULL CHECK(status IN ('running','blocked','completed')),
 stage TEXT NOT NULL, message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO factory_runs_icvs SELECT * FROM factory_runs;
CREATE TABLE factory_outputs_icvs (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES factory_runs_icvs(id), engine TEXT NOT NULL,
 content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO factory_outputs_icvs SELECT * FROM factory_outputs;
CREATE TABLE activity_icvs (
 id TEXT PRIMARY KEY, product_id TEXT REFERENCES products_icvs(id), title TEXT NOT NULL,
 department TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'info', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO activity_icvs SELECT * FROM activity;
CREATE TABLE deployments_icvs (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products_icvs(id), environment TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO deployments_icvs SELECT * FROM deployments;
DROP TABLE deployments;
DROP TABLE activity;
DROP TABLE factory_outputs;
DROP TABLE factory_runs;
DROP TABLE approvals;
DROP TABLE products;
ALTER TABLE products_icvs RENAME TO products;
ALTER TABLE approvals_icvs RENAME TO approvals;
ALTER TABLE factory_runs_icvs RENAME TO factory_runs;
ALTER TABLE factory_outputs_icvs RENAME TO factory_outputs;
ALTER TABLE activity_icvs RENAME TO activity;
ALTER TABLE deployments_icvs RENAME TO deployments;
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE UNIQUE INDEX idx_factory_active ON factory_runs(product_id) WHERE status IN ('running','blocked');
CREATE TABLE workflow_events (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES factory_runs(id),
 product_id TEXT NOT NULL REFERENCES products(id), sequence INTEGER NOT NULL,
 from_stage TEXT, to_stage TEXT NOT NULL, engine TEXT NOT NULL,
 actor TEXT NOT NULL, reason TEXT NOT NULL, evidence TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(run_id, sequence)
);
CREATE INDEX idx_workflow_product ON workflow_events(product_id, sequence);
CREATE TABLE workflow_approvals (
 approval_id TEXT PRIMARY KEY REFERENCES approvals(id),
 run_id TEXT NOT NULL UNIQUE REFERENCES factory_runs(id)
);
