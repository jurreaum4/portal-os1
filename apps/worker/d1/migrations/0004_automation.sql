-- Additive ICVS orchestration; legacy product/approval/API contracts are preserved.
CREATE TABLE ideas (
 id TEXT PRIMARY KEY, submission_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 title TEXT NOT NULL, problem TEXT NOT NULL, audience TEXT NOT NULL,
 requirements TEXT NOT NULL CHECK(json_valid(requirements)),
 success_metrics TEXT NOT NULL CHECK(json_valid(success_metrics)),
 dependencies TEXT NOT NULL CHECK(json_valid(dependencies)),
 platform_targets TEXT NOT NULL CHECK(json_valid(platform_targets)),
 runtime_requirements TEXT NOT NULL CHECK(json_valid(runtime_requirements)),
 impact INTEGER NOT NULL CHECK(impact BETWEEN 0 AND 100),
 confidence INTEGER NOT NULL CHECK(confidence BETWEEN 0 AND 100),
 effort INTEGER NOT NULL CHECK(effort BETWEEN 0 AND 100),
 risk INTEGER NOT NULL CHECK(risk BETWEEN 0 AND 100),
 score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 state TEXT NOT NULL DEFAULT 'Submitted' CHECK(state IN ('Submitted','Qualified','Rejected')),
 product_id TEXT UNIQUE REFERENCES products(id), unit_id TEXT REFERENCES portfolio_units(id),
 source TEXT NOT NULL, reason TEXT NOT NULL DEFAULT 'Awaiting qualification',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE automation_workflows (
 product_id TEXT PRIMARY KEY REFERENCES products(id), idea_id TEXT NOT NULL UNIQUE REFERENCES ideas(id),
 stage TEXT NOT NULL CHECK(stage IN ('Idea','Discovery','Specification','Architecture','Simulation','Build','QA','Ready','Published')),
 status TEXT NOT NULL CHECK(status IN ('active','awaiting_governor','paused','complete')),
 generation INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
 last_operation TEXT NOT NULL UNIQUE, reason TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE automation_artifacts (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES automation_workflows(product_id),
 generation INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('discovery','specification','architecture','simulation')),
 content TEXT NOT NULL CHECK(json_valid(content)), policy_version TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(product_id,generation,kind)
);
CREATE TABLE automation_resources (
 department TEXT PRIMARY KEY CHECK(department IN ('GOV','STRAT','ARCH','BUILD','TEST','OPS','DATA','GROWTH')),
 capacity INTEGER NOT NULL CHECK(capacity BETWEEN 0 AND 100),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE automation_jobs (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES automation_workflows(product_id),
 generation INTEGER NOT NULL, stage TEXT NOT NULL, department TEXT NOT NULL REFERENCES automation_resources(department),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','leased','succeeded','failed','cancelled')),
 attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3),
 lease_token TEXT, lease_until TEXT, worker_id TEXT,
 result TEXT CHECK(result IS NULL OR json_valid(result)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(product_id,generation,stage)
);
CREATE INDEX idx_automation_jobs_queue ON automation_jobs(department,status,created_at);
CREATE TABLE automation_gates (
 approval_id TEXT PRIMARY KEY REFERENCES approvals(id), product_id TEXT NOT NULL REFERENCES automation_workflows(product_id),
 generation INTEGER NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('risk','retry','publish','reverse')),
 target_stage TEXT NOT NULL, expected_version INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','applied','superseded')),
 reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(product_id,generation,purpose,expected_version)
);
CREATE TABLE automation_promotions (
 product_id TEXT PRIMARY KEY REFERENCES automation_workflows(product_id),
 classification TEXT NOT NULL CHECK(classification IN ('Archive','Maintain','Improve','Promote')),
 reason TEXT NOT NULL, inputs TEXT NOT NULL CHECK(json_valid(inputs)), policy_version TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE automation_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT, entity_id TEXT NOT NULL,
 kind TEXT NOT NULL, action TEXT NOT NULL, from_state TEXT, to_state TEXT,
 details TEXT NOT NULL CHECK(json_valid(details)),
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_automation_events_product ON automation_events(product_id,id);
CREATE TRIGGER automation_events_no_update BEFORE UPDATE ON automation_events BEGIN SELECT RAISE(ABORT,'Automation audit is immutable'); END;
CREATE TRIGGER automation_events_no_delete BEFORE DELETE ON automation_events BEGIN SELECT RAISE(ABORT,'Automation audit is immutable'); END;
CREATE TRIGGER ideas_insert_audit AFTER INSERT ON ideas BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,to_state,details) VALUES(NEW.product_id,NEW.id,'idea','submitted',NEW.state,json_object('source',NEW.source,'score',NEW.score,'reason',NEW.reason)); END;
CREATE TRIGGER ideas_update_audit AFTER UPDATE ON ideas BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,from_state,to_state,details) VALUES(NEW.product_id,NEW.id,'idea','qualified',OLD.state,NEW.state,json_object('reason',NEW.reason,'score',NEW.score)); END;
CREATE TRIGGER workflow_insert_audit AFTER INSERT ON automation_workflows BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,to_state,details) VALUES(NEW.product_id,NEW.product_id,'workflow','created',NEW.stage,json_object('generation',NEW.generation,'version',NEW.version,'operation',NEW.last_operation,'reason',NEW.reason,'status',NEW.status)); END;
CREATE TRIGGER workflow_update_audit AFTER UPDATE ON automation_workflows BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,from_state,to_state,details) VALUES(NEW.product_id,NEW.product_id,'workflow',CASE WHEN NEW.generation>OLD.generation THEN 'reversed' ELSE 'transition' END,OLD.stage,NEW.stage,json_object('generation',NEW.generation,'version',NEW.version,'operation',NEW.last_operation,'reason',NEW.reason,'status',NEW.status)); END;
CREATE TRIGGER artifact_audit AFTER INSERT ON automation_artifacts BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,details) VALUES(NEW.product_id,NEW.id,'artifact',NEW.kind,json_object('generation',NEW.generation,'policyVersion',NEW.policy_version)); END;
CREATE TRIGGER artifact_no_update BEFORE UPDATE ON automation_artifacts BEGIN SELECT RAISE(ABORT,'Artifacts are immutable'); END;
CREATE TRIGGER artifact_no_delete BEFORE DELETE ON automation_artifacts BEGIN SELECT RAISE(ABORT,'Artifacts are immutable'); END;
CREATE TRIGGER job_insert_audit AFTER INSERT ON automation_jobs BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,to_state,details) VALUES(NEW.product_id,NEW.id,'job','allocated',NEW.status,json_object('department',NEW.department,'stage',NEW.stage,'generation',NEW.generation)); END;
CREATE TRIGGER job_update_audit AFTER UPDATE ON automation_jobs BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,from_state,to_state,details) VALUES(NEW.product_id,NEW.id,'job','updated',OLD.status,NEW.status,json_object('attempt',NEW.attempt,'worker',NEW.worker_id,'leaseUntil',NEW.lease_until,'result',json(NEW.result))); END;
CREATE TRIGGER resource_insert_audit AFTER INSERT ON automation_resources BEGIN
 INSERT INTO automation_events(entity_id,kind,action,details) VALUES(NEW.department,'resource','configured',json_object('capacity',NEW.capacity)); END;
CREATE TRIGGER resource_update_audit AFTER UPDATE ON automation_resources BEGIN
 INSERT INTO automation_events(entity_id,kind,action,details) VALUES(NEW.department,'resource','configured',json_object('previousCapacity',OLD.capacity,'capacity',NEW.capacity)); END;
CREATE TRIGGER gate_insert_audit AFTER INSERT ON automation_gates BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,to_state,details) VALUES(NEW.product_id,NEW.approval_id,'gate','requested',NEW.state,json_object('purpose',NEW.purpose,'targetStage',NEW.target_stage,'reason',NEW.reason)); END;
CREATE TRIGGER gate_update_audit AFTER UPDATE ON automation_gates BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,from_state,to_state,details) VALUES(NEW.product_id,NEW.approval_id,'gate','resolved',OLD.state,NEW.state,json_object('purpose',NEW.purpose)); END;
CREATE TRIGGER promotion_insert_audit AFTER INSERT ON automation_promotions BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,to_state,details) VALUES(NEW.product_id,NEW.product_id,'promotion','classified',NEW.classification,json_object('reason',NEW.reason,'inputs',json(NEW.inputs),'policyVersion',NEW.policy_version)); END;
CREATE TRIGGER promotion_update_audit AFTER UPDATE ON automation_promotions BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,from_state,to_state,details) VALUES(NEW.product_id,NEW.product_id,'promotion','classified',OLD.classification,NEW.classification,json_object('reason',NEW.reason,'inputs',json(NEW.inputs),'policyVersion',NEW.policy_version)); END;
-- Initial capacity is explicit scheduling policy, not fabricated workload.
INSERT INTO automation_resources(department,capacity) VALUES ('GOV',1),('STRAT',1),('ARCH',1),('BUILD',1),('TEST',1),('OPS',1),('DATA',1),('GROWTH',1);
CREATE TABLE automation_scheduler (id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL DEFAULT 0);
INSERT INTO automation_scheduler(id) VALUES(1);
CREATE TRIGGER approval_automation_insert_audit AFTER INSERT ON approvals BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,to_state,details) VALUES(NEW.product_id,NEW.id,'approval','requested',NEW.status,json_object('action',NEW.action,'priority',NEW.priority,'risk',NEW.risk)); END;
CREATE TRIGGER approval_automation_update_audit AFTER UPDATE OF status ON approvals WHEN OLD.status<>NEW.status BEGIN
 INSERT INTO automation_events(product_id,entity_id,kind,action,from_state,to_state,details) VALUES(NEW.product_id,NEW.id,'approval',COALESCE(NEW.decision_kind,NEW.status),OLD.status,NEW.status,json_object('reason',NEW.decision_reason)); END;
CREATE TRIGGER workflow_no_delete BEFORE DELETE ON automation_workflows BEGIN SELECT RAISE(ABORT,'Workflow history must be retained'); END;
CREATE TRIGGER ideas_no_delete BEFORE DELETE ON ideas BEGIN SELECT RAISE(ABORT,'Idea history must be retained'); END;
CREATE TRIGGER jobs_no_delete BEFORE DELETE ON automation_jobs BEGIN SELECT RAISE(ABORT,'Job history must be retained'); END;
CREATE TRIGGER gates_no_delete BEFORE DELETE ON automation_gates BEGIN SELECT RAISE(ABORT,'Governor gate history must be retained'); END;
CREATE INDEX idx_ideas_intake ON ideas(state,created_at,id);
CREATE INDEX idx_workflows_scheduler ON automation_workflows(status,product_id);
CREATE INDEX idx_jobs_expiry ON automation_jobs(status,lease_until);
CREATE INDEX idx_gates_project ON automation_gates(product_id,generation,state);
