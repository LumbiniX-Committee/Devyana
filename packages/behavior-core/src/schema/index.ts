import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    browserType: text("browser_type").notNull(),
    url: text("url").notNull(),
    hostname: text("hostname").notNull(),
    pathname: text("pathname").notNull(),
    meta: text("meta"),
    durationMs: integer("duration_ms").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp" }).notNull(),
    matchedRules: text("matched_rules").notNull(),
    primaryRuleId: text("primary_rule_id"),
    recordedAt: integer("recorded_at", { mode: "timestamp" }).defaultNow(),
});

export type SessionInsert = typeof sessions.$inferInsert;
export type SessionSelect = typeof sessions.$inferSelect;
