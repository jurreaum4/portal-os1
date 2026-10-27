-- Preserve legacy products and decisions while expanding the operational model.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE divisions (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#6c62db');
INSERT INTO divisions VALUES ('max-games','MAX Games','#7c65e9'),('max-media','MAX Media','#3b9bb5'),('max-art','MAX Art','#d49353'),('max-institute','MAX Institute','#55a582');
CREATE TABLE products_next (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 stage TEXT NOT NULL CHECK(stage IN ('Idea','Discovery','Specification','Architecture','Simulation','Build','Test','Package','Ready','Published','Validation','Live','Archived')),
 score INTEGER NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 division_id TEXT NOT NULL DEFAULT 'max-games' REFERENCES divisions(id),
 revenue REAL NOT NULL DEFAULT 0 CHECK(revenue >= 0),
 status TEXT NOT NULL DEFAULT 'On track' CHECK(status IN ('On track','Attention','Paused'))
);
INSERT INTO products_next (id,name,description,stage,score,updated_at) SELECT id,name,description,stage,score,updated_at FROM products;
CREATE TABLE approvals_next (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products_next(id), action TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN ('High','Medium','Low')), risk TEXT NOT NULL CHECK(risk IN ('High','Medium','Low')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','overridden')),
 decided_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decision_note TEXT NOT NULL DEFAULT ''
);
INSERT INTO approvals_next (id,product_id,action,priority,risk,status,decided_at,created_at) SELECT id,product_id,action,priority,risk,status,decided_at,created_at FROM approvals;
DROP TABLE approvals;
DROP TABLE products;
ALTER TABLE products_next RENAME TO products;
ALTER TABLE approvals_next RENAME TO approvals;
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE TABLE factory_runs (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
 status TEXT NOT NULL CHECK(status IN ('running','blocked','completed')),
 stage TEXT NOT NULL, message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_factory_active ON factory_runs(product_id) WHERE status IN ('running','blocked');
CREATE TABLE factory_outputs (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES factory_runs(id), engine TEXT NOT NULL,
 content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE activity (
 id TEXT PRIMARY KEY, product_id TEXT REFERENCES products(id), title TEXT NOT NULL,
 department TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'info', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
