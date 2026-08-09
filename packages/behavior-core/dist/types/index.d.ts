import type { InterventionTaskType } from "../events";
export type MetaField = string;
export type ParsedUrl = {
    hostname: string;
    pathname: string;
    search: string;
};
export type UrlCondition = {
    hostname?: string;
    pathname?: string;
    search?: string;
};
export type RefCondition = {
    ref: string;
};
export type MatchSpec = UrlCondition | RefCondition;
export type InterventionTrigger = "immediate" | "on_limit_exceeded";
export type InterventionKind = "breathing";
export type InterventionSpec = {
    trigger: InterventionTrigger;
    type: InterventionKind;
    durationSec: number;
    cooldownMs: number;
    /**
     * Which actionable task the intervention overlay should run after the
     * Buddha's Palm video. Falls back to `inhale_exhale` when absent.
     */
    taskType?: InterventionTaskType;
    /**
     * Task-specific parameters forwarded to the overlay (e.g. a realization
     * question, divine prompt list, or custom panel copy).
     */
    params?: Record<string, unknown>;
    /**
     * Optional usage budget for `on_limit_exceeded`, compared against the
     * rule's accumulated session time. When absent the enforcement engine
     * falls back to a sensible default (see `DEFAULT_USAGE_LIMIT_MS` in the
     * extension).
     */
    limitMs?: number;
};
export type RuleBehavior = {
    emit?: "always" | "never" | "fallback";
    priority?: number;
    suppress?: Array<string>;
    exclusive?: boolean;
    batchWith?: Array<string>;
    category?: string;
    trackHostnames?: boolean;
    intervention?: InterventionSpec;
};
export type Rule = {
    id: string;
    match: MatchSpec | Array<MatchSpec>;
    meta?: Array<MetaField>;
    include?: Array<string>;
    behavior?: RuleBehavior;
};
export type FieldMatcher = (value: string) => boolean;
export type LiveCondition = {
    hostname: FieldMatcher | null;
    pathname: FieldMatcher | null;
    search: FieldMatcher | null;
};
export type LiveRule = {
    id: string;
    conditions: Array<LiveCondition>;
    metaFields: Array<MetaField>;
    include: Array<string>;
    needsMeta: boolean;
    behavior: Required<Omit<RuleBehavior, "intervention">> & {
        intervention: InterventionSpec | null;
    };
};
export type PageMeta = {
    [field: string]: string | Array<string> | undefined;
    matchedTerms?: Array<string>;
};
export type Session = {
    ruleIds: Array<string>;
    primaryRuleId: string;
    tabId: number;
    startedAt: number;
    meta?: PageMeta;
    hostname?: string;
    pathname?: string;
    url?: string;
};
export type PageMetaMessage = {
    meta: PageMeta;
    url: string;
};
export type RequestMetaMessage = {
    type: "REQUEST_META";
    metaFields: Array<MetaField>;
    includeTerms: Array<string>;
};
export declare const RULES_KEY = "vinaya_rules";
export declare const SESSION_KEY = "vinaya_session";
export declare const TIME_KEY: (id: string) => string;
export declare const META_KEY: (id: string) => string;
export declare const HOSTNAME_TIME_KEY: (ruleId: string, hostname: string) => string;
export declare const FLUSH_ALARM = "vinaya_flush";
export declare const FLUSH_PERIOD_MIN = 1;
export declare const SWITCH_DEBOUNCE_MS = 150;
export declare const SPA_NAV_DEBOUNCE_MS = 500;
//# sourceMappingURL=index.d.ts.map