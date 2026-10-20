-- A successful read is evidence of data availability, not evidence of absence.
CREATE TABLE lms_scope_reads (
  chat_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, scope)
);
