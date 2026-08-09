import type { PageMeta, Rule } from "../types";
export type BrowserType = "chrome" | "edge" | "brave" | "opera" | "firefox" | "unknown";
export type SessionEndEvent = {
    event: "session_end";
    clientId: string;
    browserType: BrowserType;
    ruleIds: Array<string>;
    primaryRuleId: string;
    category: string;
    url: string;
    hostname: string;
    pathname: string;
    meta: PageMeta;
    startedAt: number;
    endAt: number;
    durationMs: number;
    tabId: number;
    /**
     * Number of original short sessions merged into this single event by the
     * extension's offline aggregation layer. Present only for events that were
     * coalesced offline while the desktop bridge was unreachable (the
     * durationMs is the sum of all merged sessions, startedAt/endAt span the
     * merge window). Absent for live/connected events.
     */
    aggregatedFrom?: number;
};
export type FocusLostEvent = {
    event: "focus_lost";
};
export type FocusGainedEvent = {
    event: "focus_gained";
};
export type PageMetaScannedEvent = {
    event: "page_meta_scanned";
    url: string;
    meta: PageMeta;
};
export type RuleViolationEvent = {
    event: "rule_violation";
    ruleId?: string;
    url?: string;
    message?: string;
    meta?: PageMeta;
};
export type SystemEvent = {
    event: "system_event";
    name: string;
    message?: string;
    data?: Record<string, unknown>;
};
export type VinayaEvent = SessionEndEvent | FocusLostEvent | FocusGainedEvent | PageMetaScannedEvent | RuleViolationEvent | SystemEvent;
export type HandshakeMessage = {
    type: "handshake";
    clientId: string;
    browserType: BrowserType;
    extensionVersion: string;
};
export type EventEnvelope = {
    entryId: string;
} & VinayaEvent;
export type ClientMessage = HandshakeMessage | EventEnvelope;
export type DesktopCommand = {
    command: "soft_block";
    tabId: number;
} | {
    command: "hard_block";
    tabId: number;
} | {
    command: "unblock";
    tabId: number;
} | {
    command: "pause_media";
    tabId: number;
} | {
    command: "resume_media";
    tabId: number;
} | {
    command: "show_warning";
    tabId: number;
    message: string;
    gracePeriodMs: number;
} | {
    command: "update_rules";
    rules: Array<Rule>;
} | {
    command: "update_tasks";
    tasks: Array<Task>;
} | {
    command: "show_intervention";
    tabId: number;
    taskType?: InterventionTaskType;
    params?: Record<string, unknown>;
    durationSec?: number;
    tasks?: Array<Task>;
} | {
    command: "set_focus_mode";
    active: boolean;
    workRuleIds?: Array<string>;
};
export type ServerAck = {
    type: "ack";
    ids: Array<string>;
};
export type ServerMessage = ServerAck | DesktopCommand;
/**
 * A single suggested task shown in the Phase 2 panel of the intervention
 * overlay. Sourced from `chrome.storage.local["vinaya_tasks"]` (sent by the
 * desktop via the `update_tasks` command) or from a local default linking to
 * the Vinaya dashboard.
 */
export type Task = {
    id: string;
    title: string;
    url?: string;
};
/** Sent by the background to a tab to mount the full-page intervention. */
export type InterventionMessage = {
    type: "show_intervention";
    tabId?: number;
    taskType: InterventionTaskType;
    params?: Record<string, unknown>;
    durationSec?: number;
    tasks?: Array<Task>;
};
/**
 * The actionable phase the Buddha's Palm overlay should run once the video has
 * played to completion. Rules / the desktop pick one to drive a distinct,
 * type-aware task.
 */
export type InterventionTaskType = "realization" | "inhale_exhale" | "divine_followups" | "custom";
/**
 * Sent by the intervention content script as soon as the overlay mounts so the
 * enforcement engine knows never to inject a second overlay into the tab.
 */
export type InterventionActiveMessage = {
    type: "intervention_active";
    tabId?: number;
};
/**
 * Sent by the content script when the overlay is dismissed. `completed: true`
 * means the user acted on a suggested task (navigated to a task URL); false
 * means they picked "I'll choose later". In both cases the evaluator arms the
 * rule cooldown so the restricted site cannot be revisited immediately.
 */
export type InterventionCompletedMessage = {
    type: "intervention_completed";
    tabId?: number;
    completed: boolean;
    /** Task type that ran immediately before the suggestion phase. */
    taskType?: InterventionTaskType;
    /** Task-specific result (e.g. the realization reflection text). */
    response?: unknown;
};
//# sourceMappingURL=index.d.ts.map