-- Viyana behavioral runtime: analytics + AI batching.

-- Per-day rollups so dashboard refreshes never scan thousands of sessions.
-- Refresh interval: 5 minutes for the current day, lazily backfilled for
-- past days on first request.
CREATE TABLE IF NOT EXISTS daily_summaries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,                     -- YYYY-MM-DD (local timezone)
    total_focus_ms INTEGER NOT NULL DEFAULT 0,
    total_distraction_ms INTEGER NOT NULL DEFAULT 0,
    distraction_count INTEGER NOT NULL DEFAULT 0,
    session_count INTEGER NOT NULL DEFAULT 0,
    top_distraction_site TEXT,
    top_distraction_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(date)
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date);

-- Track AI batch flushes for observability (which sessions were sent, when,
-- and whether compression merged them).
CREATE TABLE IF NOT EXISTS ai_batches (
    id TEXT PRIMARY KEY,
    batch_no INTEGER NOT NULL,
    session_count INTEGER NOT NULL DEFAULT 0,
    merged_count INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    success INTEGER NOT NULL DEFAULT 0
);