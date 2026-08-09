-- Frocus behavioral runtime: task system with AI recommendations, recurrence
-- and extension-driven auto-completion.

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'completed'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    due_date TEXT,                            -- YYYY-MM-DD (local timezone)
    recurrence_rule TEXT,                     -- NULL or RRULE (e.g. "FREQ=DAILY")
    parent_task_id TEXT REFERENCES tasks(id), -- previous instance in a recurrence chain
    energy_level TEXT,                        -- 'low' | 'medium' | 'high'
    completion_trigger TEXT,                  -- JSON: { "rule_ids": [...], "ai_category": "...", "min_duration_ms": ... }
    completed_at TEXT,                        -- YYYY-MM-DD HH:MM:SS (local timezone)
    user_id TEXT REFERENCES user_profile(id)  -- single-user app, future-proof
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_trigger ON tasks(status, completion_trigger);
