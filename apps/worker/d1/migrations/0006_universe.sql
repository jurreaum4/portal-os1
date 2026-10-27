CREATE TABLE lifecycle_stages(id TEXT PRIMARY KEY, position INTEGER NOT NULL);
INSERT INTO lifecycle_stages VALUES ('Idea',0),('Discovery',1),('Research',2),('Specification',3),('Architecture',4),('Simulation',5),('Build',6),('QA',7),('Ready',8),('Published',9),('Test',10),('Package',11),('Validation',12),('Live',13),('Archived',14);
PRAGMA defer_foreign_keys = ON;
CREATE TABLE products_icvs (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 stage TEXT NOT NULL REFERENCES lifecycle_stages(id),
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
CREATE TABLE workflow_events_next (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES factory_runs_icvs(id), product_id TEXT NOT NULL REFERENCES products_icvs(id),
 sequence INTEGER NOT NULL, from_stage TEXT, to_stage TEXT NOT NULL, engine TEXT NOT NULL, actor TEXT NOT NULL,
 reason TEXT NOT NULL, evidence TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(run_id,sequence)
);
INSERT INTO workflow_events_next SELECT * FROM workflow_events;
CREATE TABLE workflow_approvals_next (approval_id TEXT PRIMARY KEY REFERENCES approvals_icvs(id),run_id TEXT NOT NULL UNIQUE REFERENCES factory_runs_icvs(id));
INSERT INTO workflow_approvals_next SELECT * FROM workflow_approvals;
DROP TABLE workflow_approvals;
DROP TABLE workflow_events;
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
ALTER TABLE workflow_events_next RENAME TO workflow_events;
ALTER TABLE workflow_approvals_next RENAME TO workflow_approvals;
CREATE INDEX idx_workflow_product ON workflow_events(product_id,sequence);
ALTER TABLE divisions ADD COLUMN parent_id TEXT REFERENCES divisions(id);
ALTER TABLE divisions ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
INSERT OR IGNORE INTO divisions(id,name,color,category) VALUES
 ('max-apps','MAX Apps','#65aaf1','apps'),('max-sports','MAX Sports','#70d9aa','sports'),('quantum-xr','Quantum XR','#bd9df9','xr');
UPDATE divisions SET category=CASE id WHEN 'max-games' THEN 'games' WHEN 'max-media' THEN 'media' WHEN 'max-art' THEN 'art' WHEN 'max-institute' THEN 'institute' ELSE category END;
INSERT OR IGNORE INTO divisions(id,name,color,parent_id,category) VALUES ('max-nfl','MAX NFL','#70d9aa','max-sports','sports');
INSERT OR IGNORE INTO divisions(id,name,color,parent_id,category) VALUES ('max-nba','MAX NBA','#70d9aa','max-sports','sports');
INSERT OR IGNORE INTO divisions(id,name,color,parent_id,category) VALUES ('max-mlb','MAX MLB','#70d9aa','max-sports','sports');
INSERT OR IGNORE INTO divisions(id,name,color,parent_id,category) VALUES ('max-nhl','MAX NHL','#70d9aa','max-sports','sports');
INSERT OR IGNORE INTO divisions(id,name,color,parent_id,category) VALUES ('max-soccer','MAX Soccer','#70d9aa','max-sports','sports');
INSERT OR IGNORE INTO divisions(id,name,color,parent_id,category) VALUES ('max-f1','MAX F1','#70d9aa','max-sports','sports');
INSERT OR IGNORE INTO divisions(id,name,color,parent_id,category) VALUES ('max-combat','MAX Combat','#70d9aa','max-sports','sports');
INSERT OR IGNORE INTO divisions(id,name,color,parent_id,category) VALUES ('max-esports','MAX Esports','#70d9aa','max-sports','sports');
CREATE TABLE universe_modules(id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL);
INSERT INTO universe_modules VALUES ('athlete-intelligence','Athlete Intelligence','sports');
INSERT INTO universe_modules VALUES ('team-intelligence','Team Intelligence','sports');
INSERT INTO universe_modules VALUES ('injury-intelligence','Injury Intelligence','sports');
INSERT INTO universe_modules VALUES ('draft-intelligence','Draft Intelligence','sports');
INSERT INTO universe_modules VALUES ('scouting','Scouting','sports');
INSERT INTO universe_modules VALUES ('sports-simulation','Sports Simulation','sports');
INSERT INTO universe_modules VALUES ('sports-business','Sports Business','sports');
INSERT INTO universe_modules VALUES ('sports-media','Sports Media','sports');
INSERT INTO universe_modules VALUES ('market-intelligence','Market Intelligence','sports');
CREATE TABLE department_config(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,stages TEXT NOT NULL,capacity INTEGER CHECK(capacity>=0));
INSERT INTO department_config VALUES ('GOV','Governance','Governance operations','["Ready"]',NULL);
INSERT INTO department_config VALUES ('STRAT','Strategy','Strategy operations','["Idea", "Discovery", "Research", "Validation"]',NULL);
INSERT INTO department_config VALUES ('ARCH','Architecture','Architecture operations','["Specification", "Architecture", "Simulation"]',NULL);
INSERT INTO department_config VALUES ('BUILD','Build','Build operations','["Build"]',NULL);
INSERT INTO department_config VALUES ('TEST','Quality assurance','Quality assurance operations','["QA", "Test"]',NULL);
INSERT INTO department_config VALUES ('OPS','Operations','Operations operations','["Package", "Published"]',NULL);
INSERT INTO department_config VALUES ('DATA','Intelligence','Intelligence operations','[]',NULL);
INSERT INTO department_config VALUES ('GROWTH','Growth','Growth operations','["Published", "Live"]',NULL);
CREATE TABLE workflow_definitions(id TEXT PRIMARY KEY, definition TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)));
CREATE UNIQUE INDEX one_active_workflow ON workflow_definitions(active) WHERE active=1;
INSERT INTO workflow_definitions VALUES ('icvs-v2','{"id": "icvs-v2", "steps": [{"stage": "Idea", "engine": "intake"}, {"stage": "Discovery", "engine": "discovery"}, {"stage": "Specification", "engine": "specification"}, {"stage": "Architecture", "engine": "architecture"}, {"stage": "Simulation", "engine": "simulation"}, {"stage": "Build", "engine": "build"}, {"stage": "QA", "engine": "qa"}, {"stage": "Ready", "engine": "ready"}]}',0);
INSERT INTO workflow_definitions VALUES ('icvs-v3','{"id": "icvs-v3", "steps": [{"stage": "Idea", "engine": "intake"}, {"stage": "Discovery", "engine": "discovery"}, {"stage": "Research", "engine": "research"}, {"stage": "Specification", "engine": "specification"}, {"stage": "Architecture", "engine": "architecture"}, {"stage": "Simulation", "engine": "simulation"}, {"stage": "Build", "engine": "build"}, {"stage": "QA", "engine": "qa"}, {"stage": "Ready", "engine": "ready"}, {"stage": "Published", "engine": "publish"}]}',1);
CREATE TABLE universe_records (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('entity','relationship','observation')),
 revision INTEGER NOT NULL, data TEXT NOT NULL, source TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE universe_events (
 id TEXT PRIMARY KEY, record_id TEXT NOT NULL, revision INTEGER NOT NULL, kind TEXT NOT NULL,
 before_data TEXT, after_data TEXT NOT NULL, source TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL,
 deleted INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(record_id,revision)
);
CREATE INDEX universe_kind ON universe_records(kind,deleted);
CREATE INDEX universe_history ON universe_events(record_id,revision);
CREATE TABLE universe_snapshots (
 day TEXT NOT NULL, entity_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(day,entity_id)
);
