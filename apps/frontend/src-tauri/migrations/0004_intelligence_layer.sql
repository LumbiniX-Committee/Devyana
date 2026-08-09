-- Intelligence Layer classification metadata. `ai_category` already exists in
-- the initial schema and remains nullable while the async classifier runs.
ALTER TABLE sessions ADD COLUMN bad_topic TEXT;

CREATE INDEX idx_sessions_bad_topic ON sessions(bad_topic);
