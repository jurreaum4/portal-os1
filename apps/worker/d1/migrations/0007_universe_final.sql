-- Versioned definitions leave existing Durable Object runs pinned to their contract.
UPDATE workflow_definitions SET active=0;
INSERT INTO workflow_definitions(id,definition,active) VALUES ('icvs-v3-final',
'{"id":"icvs-v3-final","steps":[{"stage":"Idea","engine":"intake"},{"stage":"Discovery","engine":"discovery"},{"stage":"Research","engine":"research"},{"stage":"Specification","engine":"specification"},{"stage":"Architecture","engine":"architecture"},{"stage":"Simulation","engine":"simulation"},{"stage":"Build","engine":"build"},{"stage":"QA","engine":"qa"},{"stage":"Package","engine":"package"},{"stage":"Ready","engine":"ready"},{"stage":"Published","engine":"publish"}]}',1);
CREATE TABLE icv_principals (
 id TEXT PRIMARY KEY CHECK(id NOT LIKE 'service:%'),
 name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('viewer','automation','governor','member')),
 token_hash TEXT NOT NULL UNIQUE,
 disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Multiple immutable decisions may belong to a run after compensation.
ALTER TABLE workflow_approvals RENAME TO old_workflow_approvals;
CREATE TABLE workflow_approvals (
 approval_id TEXT PRIMARY KEY REFERENCES approvals(id),
 run_id TEXT NOT NULL REFERENCES factory_runs(id)
);
INSERT INTO workflow_approvals SELECT * FROM old_workflow_approvals;
DROP TABLE old_workflow_approvals;
CREATE INDEX workflow_approvals_run ON workflow_approvals(run_id);
