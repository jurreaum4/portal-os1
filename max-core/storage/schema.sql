CREATE TABLE IF NOT EXISTS max_core_records (
 scope TEXT NOT NULL,
 key TEXT NOT NULL,
 value TEXT NOT NULL,
 deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
 counter INTEGER NOT NULL CHECK (counter > 0),
 actor TEXT NOT NULL,
 PRIMARY KEY (scope, key)
);
