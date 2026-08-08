import type { InterventionSpec, LiveRule, ParsedUrl, Task } from "@vinaya/behavior-core";
import {
    loadFocusMode,
    loadInterventionCooldowns,
    loadTasks,
    readAllTime,
    saveFocusMode,
    saveInterventionCooldowns,
    type FocusModeState
} from "~lib/store";

export type EnforcementDecision =
    | { action: "allow" }
    | {
        action: "intervention";
        type: "breathing";
        durationSec: number;
        tasks: Array<Task>;
        ruleId: string;
        hostname: string;
    }
    | { action: "cooldown_block"; until: number };

export const DEFAULT_BREATHING_SEC = 30
export const DEFAULT_COOLDOWN_MS = 5 * 60_000
export const DEFAULT_USAGE_LIMIT_MS = 15 * 60_000

export const FROCUS_DASHBOARD_URL = chrome.runtime.getURL("tabs/setup.html")

/** Sentinel rule id used for interventions triggered by the desktop. */
export const DESKTOP_DRIVEN_RULE_ID = "__desktop_driven__"

type ActiveIntervention = {
    tabId: number;
    ruleId: string;
    hostname: string;
    startedAt: number;
    durationSec: number;
}

/**
 * Local, deterministic enforcement engine for the Buddha's Palm intervention
 * system.
 *
 * Everything it reads comes from local state persisted in `chrome.storage.local`
 * (accumulated session times, cooldown timestamps, active focus mode) plus the
 * live rule set compiled by the tracker. It never makes network calls, so it
 * keeps working while the desktop bridge is unreachable.
 */
export class EnforcementEngine {
    private ruleMap = new Map<string, LiveRule>()

    /** Cooldown expiry timestamps keyed by `${ruleId}::${hostname}`. */
    private cooldowns: Record<string, number> = {}

    /** tabId -> in-flight intervention (prevents overlapping overlays). */
    private activeInterventions = new Map<number, ActiveIntervention>()

    private focusMode: FocusModeState = { active: false, workRuleIds: [] }

    async init(): Promise<void> {
        const [cooldowns, focus] = await Promise.all([
            loadInterventionCooldowns(),
            loadFocusMode()
        ])
        this.cooldowns = cooldowns
        this.focusMode = focus
    }

    setRules(rules: Array<LiveRule>): void {
        this.ruleMap = new Map(rules.map(rule => [rule.id, rule]))
    }

    setFocusMode(mode: FocusModeState): void {
        this.focusMode = mode
        void saveFocusMode(mode)
    }

    getFocusMode(): FocusModeState {
        return this.focusMode
    }

    // -----------------------------------------------------------------------
    // Decision
    // -----------------------------------------------------------------------

    /**
     * The price of freedom: decides what happens when a tab navigates to a URL
     * that matched rules. Order matters:
     *  1. a tab already under intervention is left alone (no stacking);
     *  2. an active cooldown downgrades the full exercise to a `cooldown_block`;
     *  3. otherwise the rule's intervention/focus config decides.
     */
    async evaluateAccess(
        tabId: number,
        url: ParsedUrl,
        matchedRuleIds: Array<string>
    ): Promise<EnforcementDecision> {
        if (this.activeInterventions.has(tabId)) {
            return { action: "allow" }
        }

        const target = this.pickTarget(matchedRuleIds)
        if (!target) return { action: "allow" }

        const until = this.cooldownUntil(target.id, url.hostname)
        if (until !== null) {
            return { action: "cooldown_block", until }
        }

        return this.decideForTarget(target, url)
    }

    /**
     * Picks the single restrictive rule this navigation should be judged
     * against. Only rules carrying an `intervention` config are candidates on
     * their own; in focus mode any non-work restricted site is a candidate so
     * the evaluator can redirect it. Fallback (record-only) rules never cause
     * an intervention.
     */
    private pickTarget(matchedRuleIds: Array<string>): LiveRule | null {
        let best: LiveRule | null = null

        for (const id of matchedRuleIds) {
            const rule = this.ruleMap.get(id)
            if (!rule) continue
            if (rule.behavior.emit === "fallback") continue
            if (!rule.behavior.intervention && !this.focusMode.active) continue
            if (!this.isNonWorkTarget(rule)) continue

            if (!best || rule.behavior.priority > best.behavior.priority) {
                best = rule
            }
        }

        return best
    }

    /**
     * Whether a matched rule describes a site that should be blocked in a
     * focus (pomodoro) session. Aggregate "record everything" rules, rules
     * explicitly whitelisted as work, and exclusive focus tools are all
     * considered work-safe unless they carry their own intervention intent.
     */
    private isNonWorkTarget(rule: LiveRule): boolean {
        if (rule.behavior.emit === "fallback") return false
        if (this.focusMode.workRuleIds?.includes(rule.id)) return false
        if (rule.behavior.intervention) return true
        if (rule.behavior.exclusive) return false
        return true
    }

    private async decideForTarget(target: LiveRule, url: ParsedUrl): Promise<EnforcementDecision> {
        const intervention = target.behavior.intervention

        if (intervention) {
            if (intervention.trigger === "immediate") {
                return this.buildIntervention(target, url, intervention)
            }

            if (intervention.trigger === "on_limit_exceeded") {
                const limit = intervention.limitMs ?? DEFAULT_USAGE_LIMIT_MS
                const elapsed = await this.elapsedRuleTime(target.id)
                if (elapsed > limit) {
                    return this.buildIntervention(target, url, intervention)
                }
                return { action: "allow" }
            }

            return { action: "allow" }
        }

        if (this.focusMode.active && this.isNonWorkTarget(target)) {
            return this.buildIntervention(target, url, null)
        }

        return { action: "allow" }
    }

    private async buildIntervention(
        target: LiveRule,
        url: ParsedUrl,
        intervention: InterventionSpec | null
    ): Promise<EnforcementDecision> {
        return {
            action: "intervention",
            type: "breathing",
            durationSec: intervention?.durationSec ?? DEFAULT_BREATHING_SEC,
            tasks: await this.buildTasks(),
            ruleId: target.id,
            hostname: url.hostname
        }
    }

    private async buildTasks(): Promise<Array<Task>> {
        const tasks = await loadTasks()
        if (tasks.length) return tasks
        return [
            {
                id: "frocus-dashboard",
                title: "Open your task dashboard",
                url: FROCUS_DASHBOARD_URL
            }
        ]
    }

    /** Total accumulated session time a rule has recorded so far. */
    private async elapsedRuleTime(ruleId: string): Promise<number> {
        const stored = await readAllTime([ruleId])
        return stored[ruleId] ?? 0
    }

    // -----------------------------------------------------------------------
    // Intervention lifecycle
    // -----------------------------------------------------------------------

    /** Records that an intervention was dispatched to `tabId`. */
    beginIntervention(
        tabId: number,
        ruleId: string,
        hostname: string,
        durationSec: number
    ): void {
        this.activeInterventions.set(tabId, {
            tabId,
            ruleId,
            hostname,
            startedAt: Date.now(),
            durationSec
        })
    }

    /**
     * The content script confirmed the overlay is live. Guards against a
     * second injection even if we never dispatched one (e.g. desktop-driven).
     */
    onInterventionActive(tabId: number): void {
        if (!tabId || this.activeInterventions.has(tabId)) return
        this.activeInterventions.set(tabId, {
            tabId,
            ruleId: DESKTOP_DRIVEN_RULE_ID,
            hostname: "",
            startedAt: Date.now(),
            durationSec: DEFAULT_BREATHING_SEC
        })
    }

    /**
     * The overlay was dismissed. Regardless of whether the user picked a task
     * or "I'll choose later", the cooldown stays active so the site cannot be
     * revisited until it expires.
     */
    onInterventionCompleted(tabId: number, _completed: boolean): void {
        const active = this.activeInterventions.get(tabId)
        if (!active) return
        this.activeInterventions.delete(tabId)

        const rule = this.ruleMap.get(active.ruleId)
        const cooldownMs =
            rule?.behavior.intervention?.cooldownMs ?? DEFAULT_COOLDOWN_MS

        this.cooldowns[this.cooldownKey(active.ruleId, active.hostname)] =
            Date.now() + cooldownMs

        void this.persistCooldowns()
    }

    onTabRemoved(tabId: number): void {
        this.activeInterventions.delete(tabId)
    }

    // -----------------------------------------------------------------------
    // Cooldown bookkeeping
    // -----------------------------------------------------------------------

    private cooldownKey(ruleId: string, hostname: string): string {
        return `${ruleId}::${hostname}`
    }

    private cooldownUntil(ruleId: string, hostname: string): number | null {
        const key = this.cooldownKey(ruleId, hostname)
        const until = this.cooldowns[key]

        if (!until) return null
        if (until <= Date.now()) {
            delete this.cooldowns[key]
            return null
        }
        return until
    }

    private async persistCooldowns(): Promise<void> {
        try {
            await saveInterventionCooldowns(this.cooldowns)
        } catch (error) {
            console.warn("Failed to persist cooldowns:", error)
        }
    }
}

export const enforcement = new EnforcementEngine()