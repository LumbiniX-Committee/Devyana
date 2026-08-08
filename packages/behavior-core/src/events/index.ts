import type { PageMeta, Rule } from "../types";

export type BrowserType =
    | "chrome"
    | "edge"
    | "brave"
    | "opera"
    | "firefox"
    | "unknown";

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

export type FocusLostEvent = { event: "focus_lost" };
export type FocusGainedEvent = { event: "focus_gained" };

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

export type VinayaEvent =
    | SessionEndEvent
    | FocusLostEvent
    | FocusGainedEvent
    | PageMetaScannedEvent
    | RuleViolationEvent
    | SystemEvent;

export type HandshakeMessage = {
    type: "handshake";
    clientId: string;
    browserType: BrowserType;
    extensionVersion: string;
};

export type EventEnvelope = { entryId: string } & VinayaEvent;

export type ClientMessage = HandshakeMessage | EventEnvelope;

export type DesktopCommand =
    | { command: "soft_block"; tabId: number }
    | { command: "hard_block"; tabId: number }
    | { command: "unblock"; tabId: number }
    | { command: "pause_media"; tabId: number }
    | { command: "resume_media"; tabId: number }
    | {
        command: "show_warning";
        tabId: number;
        message: string;
        gracePeriodMs: number;
    }
    | { command: "update_rules"; rules: Array<Rule> };

export type ServerAck = { type: "ack"; ids: Array<string> };
export type ServerMessage = ServerAck | DesktopCommand;
