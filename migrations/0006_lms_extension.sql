-- No Moodle cookies/passwords: only expiring pairing codes, hashed device tokens,
-- normalized academic records and a bounded change history/outbox.
CREATE TABLE lms_pair_codes (
  chat_id INTEGER PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  expires INTEGER NOT NULL
);
CREATE TABLE lms_devices (
  chat_id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  account TEXT,
  created_at INTEGER NOT NULL,
  last_sync INTEGER
);
CREATE TABLE lms_accounts (
  chat_id INTEGER PRIMARY KEY,
  account TEXT NOT NULL
);
CREATE TABLE lms_scopes (
  chat_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  PRIMARY KEY (chat_id, scope)
);
CREATE TABLE lms_records (
  chat_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  scope TEXT NOT NULL,
  data TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, id)
);
CREATE TABLE lms_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  notified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX lms_events_outbox ON lms_events(chat_id, notified, id);
ALTER TABLE deadlines ADD COLUMN submission_state TEXT;
ALTER TABLE deadlines ADD COLUMN submission_checked INTEGER;
