-- Additive v2 projections. MAX-CORE state remains owned by MAX-CORE.
INSERT OR IGNORE INTO divisions(id,name,color) VALUES ('max-apps','MAX Apps','#157c80');
CREATE TABLE product_telemetry (
 product_id TEXT NOT NULL REFERENCES products(id), observed_at TEXT NOT NULL,
 users INTEGER CHECK(users>=0), health INTEGER CHECK(health BETWEEN 0 AND 100),
 source TEXT NOT NULL, PRIMARY KEY(product_id,observed_at)
);
CREATE TABLE intelligence_snapshots (
 product_id TEXT NOT NULL REFERENCES products(id), day TEXT NOT NULL,
 revenue REAL NOT NULL CHECK(revenue>=0), score INTEGER NOT NULL, stage TEXT NOT NULL,
 status TEXT NOT NULL, users INTEGER, telemetry_at TEXT,
 PRIMARY KEY(product_id,day)
);
CREATE INDEX idx_intelligence_day ON intelligence_snapshots(day);
CREATE TABLE twin_relationships (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES products(id),
 target_id TEXT NOT NULL REFERENCES products(id),
 relation TEXT NOT NULL CHECK(relation IN ('depends_on','integrates_with')),
 source TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 retired_at TEXT, CHECK(source_id<>target_id)
);
CREATE UNIQUE INDEX idx_relationship_active ON twin_relationships(source_id,target_id,relation) WHERE retired_at IS NULL;
CREATE TABLE worker_operations (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
 run_id TEXT NOT NULL REFERENCES factory_runs(id), worker TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
 lease_expires_at INTEGER, evidence TEXT, message TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_worker_status ON worker_operations(worker,status);
CREATE TABLE compensation_jobs (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
 run_id TEXT NOT NULL REFERENCES factory_runs(id), approval_id TEXT NOT NULL REFERENCES approvals(id),
 status TEXT NOT NULL CHECK(status IN ('queued','running','blocked','completed')),
 attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 evidence TEXT, message TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(run_id)
);
ALTER TABLE twin_relationships ADD COLUMN retirement_reason TEXT;
CREATE TABLE department_snapshots (
 department TEXT NOT NULL, day TEXT NOT NULL, queued INTEGER NOT NULL,
 running INTEGER NOT NULL, blocked INTEGER NOT NULL,
 PRIMARY KEY(department,day)
);
ALTER TABLE compensation_jobs ADD COLUMN plan TEXT NOT NULL DEFAULT '{}';
ALTER TABLE compensation_jobs ADD COLUMN next_attempt INTEGER NOT NULL DEFAULT 0;
