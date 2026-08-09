-- Viyana behavioral runtime: initial schema.

-- User profile
CREATE TABLE user_profile (
    id TEXT PRIMARY KEY,
    gender TEXT NOT NULL,
    age INTEGER NOT NULL,
    profession TEXT NOT NULL,
    goals TEXT NOT NULL,                      -- JSON array
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Behavioral sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    browser_type TEXT NOT NULL,
    url TEXT NOT NULL,
    hostname TEXT NOT NULL,
    pathname TEXT NOT NULL,
    meta TEXT,                                -- JSON
    duration_ms INTEGER NOT NULL,
    started_at INTEGER NOT NULL,              -- epoch ms
    ended_at INTEGER NOT NULL,                -- epoch ms
    matched_rules TEXT NOT NULL,              -- JSON array of rule ids
    primary_rule_id TEXT,
    tab_id INTEGER NOT NULL DEFAULT 0,        -- tab that hosted the session (enforcement target)
    aggregated_from INTEGER DEFAULT 1,        -- number of original sessions merged offline
    ai_category TEXT,
    processed_for_graph INTEGER DEFAULT 0,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_started_at ON sessions(started_at);
CREATE INDEX idx_sessions_primary_rule ON sessions(primary_rule_id);
CREATE INDEX idx_sessions_graph ON sessions(processed_for_graph, ai_category);

-- Behavior graph produced by the Intelligence Layer
CREATE TABLE behavior_graph (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES user_profile(id),
    graph_data TEXT NOT NULL,                 -- JSON
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Constraints (rules for enforcement)
CREATE TABLE constraints (
    id TEXT PRIMARY KEY,
    rule_definition TEXT NOT NULL,  -- JSON matching the Rule type
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pending enforcement commands to send to the extension
CREATE TABLE pending_commands (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    command_type TEXT NOT NULL,   -- "soft_block", "hard_block", "show_warning", ...
    payload TEXT NOT NULL,        -- JSON of the DesktopCommand
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    delivered INTEGER DEFAULT 0
);

CREATE INDEX idx_pending_client ON pending_commands(client_id, delivered);

-- Notifications / reminders
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES user_profile(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    kind TEXT NOT NULL,            -- "hydration", "stretch", "custom", ...
    scheduled_at TEXT,
    sent INTEGER DEFAULT 0
);

-- Optional focus telemetry used for live focus-mode toggling and analytics
CREATE TABLE focus_log (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    kind TEXT NOT NULL,            -- "lost" | "gained"
    at INTEGER NOT NULL,           -- epoch ms
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_focus_client ON focus_log(client_id, at);