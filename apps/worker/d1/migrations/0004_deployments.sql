-- Populated by trusted deployment integrations; no synthetic success events.
CREATE TABLE deployments (
 id TEXT PRIMARY KEY,
 product_id TEXT NOT NULL REFERENCES products(id),
 environment TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
