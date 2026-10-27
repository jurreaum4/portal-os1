-- Additive migration: preserve all existing products, decisions and actor state.
INSERT OR IGNORE INTO divisions(id,name,color) VALUES ('quantum-xr','Quantum XR','#6558c7');
CREATE TABLE access_audit (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
 resource TEXT NOT NULL, status INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_access_audit_time ON access_audit(created_at);
CREATE TABLE marketplace_creators (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT ''
);
CREATE TABLE marketplace_releases (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL, summary TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('game','app','art','asset','media','course','framework')),
 creator_id TEXT NOT NULL REFERENCES marketplace_creators(id),
 price_minor INTEGER NOT NULL CHECK(price_minor>=0), currency TEXT NOT NULL,
 artifact TEXT NOT NULL, digest TEXT NOT NULL, download_ref TEXT NOT NULL,
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, withdrawn_at TEXT
);
CREATE INDEX idx_marketplace_type ON marketplace_releases(type,published_at);
CREATE TABLE customer_accounts (
 id TEXT PRIMARY KEY, identity_subject TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE customer_sessions (
 token_hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customer_accounts(id), expires_at INTEGER NOT NULL
);
CREATE TABLE login_challenges (
 state_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
);
CREATE TABLE marketplace_orders (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customer_accounts(id),
 release_id TEXT NOT NULL REFERENCES marketplace_releases(id),
 price_minor INTEGER NOT NULL, currency TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','paid','failed','refunded')),
 provider_ref TEXT UNIQUE, checked_at INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(customer_id,release_id)
);
CREATE TABLE customer_library (
 customer_id TEXT NOT NULL REFERENCES customer_accounts(id), release_id TEXT NOT NULL REFERENCES marketplace_releases(id),
 granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
 PRIMARY KEY(customer_id,release_id)
);
CREATE TABLE marketplace_reviews (
 customer_id TEXT NOT NULL REFERENCES customer_accounts(id), release_id TEXT NOT NULL REFERENCES marketplace_releases(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(customer_id,release_id)
);
CREATE TABLE marketplace_downloads (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customer_accounts(id),
 release_id TEXT NOT NULL REFERENCES marketplace_releases(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
