import { Storage } from "@plasmohq/storage"
import { compileRules, matchRules, parseUrl } from "~lib/compiler";
import { desktopBridge } from "~lib/desktop-bridge";
import { resolveRules } from "~lib/resolver";
import { DEFAULT_RULES } from "~lib/rules";
import {
    META_PRUNING_THRESHOLD,
    clearOfflineAccumulator,
    flushHostnameTime,
    flushMeta,
    flushTime,
    forceMinMergeTolerance,
    getCurrentMergeTolerance,
    loadOfflineAccumulator,
    loadPersistedSession,
    loadRules,
    persistSession,
    saveOfflineAccumulator,
    saveRules,
    sessionIdentityKey
} from "~lib/store";
import type { AggregatedSession, PersistedSession } from "~lib/store";
import { FLUSH_ALARM, FLUSH_PERIOD_MIN, RULES_KEY, SWITCH_DEBOUNCE_MS } from "@vinaya/behavior-core";
import type {
    InterventionActiveMessage,
    InterventionCompletedMessage,
    InterventionMessage,
    InterventionTaskType,
    LiveRule,
    PageMeta,
    RequestMetaMessage,
    Rule,
    Session,
    SessionEndEvent,
    SystemEvent,
    Task
} from "@vinaya/behavior-core";
import { DESKTOP_DRIVEN_RULE_ID, enforcement } from "~background/enforcement";

/**
 * How long we wait before committing a `focus_lost`, and how recently a real
 * `focus_lost` may have been emitted before we suppress a paired `focus_gained`.
 * Absorbs rapid Alt+Tab flickers (< 2s) so the event log is not polluted.
 */
const FOCUS_DEBOUNCE_MS = 2_000

class VinayaTracker {
    private rules: Array<LiveRule> = []

    private session: Session | null = null

    private metaCache = new Map<number, PageMeta>()

    private timeAcc: Record<string, number> = {}
    private metaAcc: Record<string, Array<PageMeta>> = {}
    private hostnameTimeAcc: Record<string, number> = {}

    private isFocused = true
    private activeTabId: number | null = null
    private switchDebounceTimer: ReturnType<typeof setTimeout> | null = null
    private pendingSwitchAt: number | null = null

    /**
     * Focus debouncer state. `lostTimer` is armed when all windows lose focus;
     * if focus returns before it fires, neither `focus_lost` nor `focus_gained`
     * is emitted (both sides of the flicker are suppressed). `lastEmitted` /
     * `lastEmittedAt` track the last truly committed focus event so a rapid
     * regained focus right after a real lost is also suppressed.
     */
    private focusDebounce: {
        lostTimer: ReturnType<typeof setTimeout> | null
        lastEmitted: "lost" | "gained" | null
        lastEmittedAt: number
    } = {
            lostTimer: null,
            lastEmitted: null,
            lastEmittedAt: 0
        }

    /**
     * Serialises all mutations of the offline aggregation accumulator. Every
     * read-modify-write of `vinaya_offline_accumulator` is chained onto this
     * promise so rapid tab switches (or a concurrent flush-on-connect) can
     * never interleave and lose an entry.
     */
    private accumulatorQueue: Promise<unknown> = Promise.resolve()

    private readonly storage = new Storage({ area: "local" })

    constructor() {
        // Reconnect hook: flush aggregated offline sessions into the event log
        // before the bridge replays it.
        desktopBridge.onConnect(() => this.flushOfflineAccumulator())

        // Passive mode means a long offline window is likely — escalate merge
        // tolerance immediately instead of waiting for the log to fill up.
        desktopBridge.onPassiveMode(() => {
            void forceMinMergeTolerance(0)
        })

        this.attachListeners()
        this.init()
    }

    private async init() {
        const stored = await loadRules()
        if (!stored) await saveRules(DEFAULT_RULES)
        this.rules = compileRules(stored ?? DEFAULT_RULES)

        await enforcement.init()
        enforcement.setRules(this.rules)

        const all = (await chrome.storage.local.get()) as Record<string, unknown>
        const namedRuleIds = new Set(
            (stored ?? DEFAULT_RULES)
                .filter((rule) => rule.behavior?.emit !== "fallback")
                .map((rule) => rule.id)
        )

        const keysToRemove = Object.keys(all).filter((key) => {
            if (!key.startsWith("vinaya_htime_")) return false
            const ruleId = key.slice("vinaya_htime_".length).split("::")[0]
            return namedRuleIds.has(ruleId)
        })

        if (keysToRemove.length) await chrome.storage.local.remove(keysToRemove)

        const orphan = await loadPersistedSession()
        if (orphan) this.recoverOrphanedSession(orphan)

        const existing = await chrome.alarms.get(FLUSH_ALARM)

        if (!existing) {
            chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: FLUSH_PERIOD_MIN })
        }

        this.storage.watch({
            [RULES_KEY]: ({ newValue }) => {
                this.rules = compileRules((newValue as Array<Rule>) ?? DEFAULT_RULES)
                enforcement.setRules(this.rules)
            }
        })

        try {
            const window = await chrome.windows.getLastFocused()
            this.isFocused = window.focused

            if (!this.isFocused) return

            const [tab] = await chrome.tabs.query({
                active: true,
                lastFocusedWindow: true
            })

            if (tab?.id) {
                this.activeTabId = tab.id
                this.scheduleSwitch(tab.id)
            }
        } catch (error) { }
    }

    private attachListeners(): void {
        chrome.tabs.onActivated.addListener(({ tabId }) => {
            this.activeTabId = tabId
            this.scheduleSwitch(tabId)
        })

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (tabId !== this.activeTabId && !tab.active) return

            const shouldSwitch =
                changeInfo.status === "complete" ||
                Boolean(changeInfo.url) ||
                Boolean(changeInfo.title)

            if (!shouldSwitch) return

            this.scheduleSwitch(tabId)
        })

        chrome.tabs.onRemoved.addListener((tabId) => {
            if (this.session?.tabId === tabId) this.endSession()
            this.metaCache.delete(tabId)
            enforcement.onTabRemoved(tabId)
        })

        chrome.windows.onFocusChanged.addListener((windowId) =>
            this.handleFocusChange(windowId)
        )

        chrome.alarms.onAlarm.addListener(({ name }) => {
            if (name === FLUSH_ALARM) this.flush()
        })

        chrome.runtime.onMessage.addListener(this.handleExtensionMessage)
    }

    /**
     * Bridges the intervention content script back into the enforcement engine.
     * `intervention_active` confirms the overlay is live so a duplicate can never
     * be injected; `intervention_completed` (task chosen / "choose later") feeds
     * the cooldown bookkeeping and surfaces a `system_event` to the desktop.
     */
    private handleExtensionMessage = (
        message: InterventionActiveMessage | InterventionCompletedMessage | unknown,
        sender: chrome.runtime.MessageSender,
        _sendResponse: (response?: unknown) => void
    ): boolean => {
        if (!message || typeof message !== "object" || !("type" in (message as object))) {
            return false
        }

        const type = (message as { type?: string }).type

        if (type === "intervention_active") {
            const tabId = (message as InterventionActiveMessage).tabId ?? sender.tab?.id
            if (tabId) enforcement.onInterventionActive(tabId)
            return false
        }

        if (type === "intervention_completed") {
            const payload = message as InterventionCompletedMessage
            const tabId = payload.tabId ?? sender.tab?.id

            if (tabId) {
                const completed = payload.completed === true
                enforcement.onInterventionCompleted(tabId, completed)

                const systemEvent: SystemEvent = {
                    event: "system_event",
                    name: "intervention_completed",
                    data: {
                        tabId,
                        completed,
                        taskType: payload.taskType,
                        response: payload.response
                    }
                }
                void desktopBridge.send(systemEvent)
            }

            return false
        }

        return false
    }

    private async handleFocusChange(windowId: number): Promise<void> {
        if (windowId === chrome.windows.WINDOW_ID_NONE) {
            try {
                const windows = await chrome.windows.getAll({ populate: false })
                if (windows.some((window) => window.focused)) return
            } catch (e) { }

            this.isFocused = false

            if (this.switchDebounceTimer) clearTimeout(this.switchDebounceTimer)
            this.switchDebounceTimer = null

            this.scheduleSwitch()

            // Debounced focus_lost: arm a timer; if focus returns before it
            // fires we treat the loss as a flicker and never emit the event.
            if (this.focusDebounce.lostTimer) clearTimeout(this.focusDebounce.lostTimer)
            this.focusDebounce.lostTimer = setTimeout(() => {
                this.focusDebounce.lostTimer = null
                this.focusDebounce.lastEmitted = "lost"
                this.focusDebounce.lastEmittedAt = Date.now()
                desktopBridge.send({ event: "focus_lost" })
            }, FOCUS_DEBOUNCE_MS)

            // TODO: detect idle state

            return
        }

        const now = Date.now()

        let emitGained = true

        if (this.focusDebounce.lostTimer) {
            // We got focus back within the debounce window: the loss was a
            // transient flicker, so cancel the pending lost AND suppress the
            // paired gained — neither side of the rapid cycle is sent.
            clearTimeout(this.focusDebounce.lostTimer)
            this.focusDebounce.lostTimer = null
            emitGained = false
        } else if (
            this.focusDebounce.lastEmitted === "lost" &&
            now - this.focusDebounce.lastEmittedAt < FOCUS_DEBOUNCE_MS
        ) {
            // A real focus_lost was committed < 2s ago and we gained focus
            // back in that window — suppress the gained to avoid a spam pair.
            emitGained = false
        }

        this.isFocused = true

        if (emitGained) {
            desktopBridge.send({ event: "focus_gained" })
            this.focusDebounce.lastEmitted = "gained"
            this.focusDebounce.lastEmittedAt = now
        }

        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                windowId
            })

            if (tab?.id) {
                this.activeTabId = tab.id
                this.scheduleSwitch(tab.id)
            }
        } catch (error) { }
    }

    private scheduleSwitch(targetTabId?: number): void {
        if (!this.pendingSwitchAt) this.pendingSwitchAt = Date.now()
        if (this.switchDebounceTimer) clearTimeout(this.switchDebounceTimer)

        this.switchDebounceTimer = setTimeout(async () => {
            this.switchDebounceTimer = null

            try {
                const windows = await chrome.windows.getAll({ populate: false })
                this.isFocused = windows.some((window) => window.focused)
            } catch (e) { }

            this.switchSession(targetTabId ?? this.activeTabId)
        }, SWITCH_DEBOUNCE_MS)
    }

    private async switchSession(targetTabId: number | null): Promise<void> {
        const switchAt = this.pendingSwitchAt ?? Date.now()
        this.pendingSwitchAt = null

        if (!this.isFocused || !targetTabId) {
            this.endSession(switchAt)
            return
        }

        try {
            const tab = await chrome.tabs.get(targetTabId)
            if (!tab) return

            const rawUrl = tab.url || tab.pendingUrl
            if (!rawUrl || !tab.id) return

            const tabId = tab.id

            const url = parseUrl(rawUrl)
            if (!url) {
                this.endSession(switchAt)
                return
            }

            const isSameMatch =
                this.session?.tabId === tabId &&
                this.session?.hostname === url.hostname &&
                this.session?.pathname === url.pathname

            const allMatched = matchRules(url, this.rules)

            if (isSameMatch) {
                const ruleMap = new Map(this.rules.map((rule) => [rule.id, rule]))
                const matchedIds = resolveRules(allMatched, this.rules)

                if (matchedIds.length && ruleMap.get(matchedIds[0])?.needsMeta) {
                    this.resolveSessionMeta(tab.id, ruleMap.get(matchedIds[0])!)
                        .then((meta) => {
                            if (meta && this.session) this.session.meta = meta
                        })
                        .catch(() => { })
                }
                return
            }

            // Buddha's Palm: let the local enforcement engine decide before a
            // session is started. Distracting navigation gets an un-skippable
            // breathing intervention; sites in cooldown get a lighter block.
            const decision = await enforcement.evaluateAccess(tabId, url, allMatched)

            if (decision.action === "cooldown_block") {
                this.endSession(switchAt)
                void chrome.tabs
                    .sendMessage(tabId, { command: "hard_block", tabId })
                    .catch(() => { })
                return
            }

            if (decision.action === "intervention") {
                this.endSession(switchAt)

                enforcement.beginIntervention(
                    tabId,
                    decision.ruleId,
                    decision.hostname,
                    decision.durationSec
                )

                const message: InterventionMessage = {
                    type: "show_intervention",
                    tabId,
                    taskType: decision.taskType,
                    params: decision.params,
                    durationSec: decision.durationSec,
                    tasks: decision.tasks
                }

                void chrome.tabs.sendMessage(tabId, message).catch(() => { })
                return
            }

            const ruleMap = new Map(this.rules.map((rule) => [rule.id, rule]))
            const matchedIds = resolveRules(allMatched, this.rules)

            if (!matchedIds.length) {
                this.endSession(switchAt)
                return
            }

            this.endSession(switchAt)

            const primaryRuleId = matchedIds[0]

            // Data that needs to be contained in a session
            this.session = {
                ruleIds: matchedIds,
                primaryRuleId,
                tabId,
                startedAt: switchAt,
                hostname: url.hostname,
                pathname: url.pathname,
                url: rawUrl
            }

            await persistSession({
                ruleIds: this.session?.ruleIds,
                primaryRuleId: this.session?.primaryRuleId,
                tabId: this.session?.tabId,
                startedAt: this.session?.startedAt,
                hostname: this.session.hostname,
                pathname: this.session.pathname
            })

            const primaryRule = ruleMap.get(primaryRuleId)

            if (primaryRule?.needsMeta) {
                const meta = await this.resolveSessionMeta(tab.id, primaryRule)

                if (meta && this.session?.primaryRuleId === primaryRuleId) this.session.meta = meta
            }

            // TODO: send notification to desktop app (session_start), let me check if it's actually needed
        } catch (error) { }
    }

    private endSession(endAt?: number): void {
        if (!this.session) return

        const endTime = endAt ?? Date.now()
        const duration = Math.max(0, endTime - this.session?.startedAt)

        const primaryRule = this.rules.find((rule) => rule.id === this.session?.primaryRuleId)

        if (duration > 0) {
            for (const id of this.session?.ruleIds) {
                this.timeAcc[id] = (this.timeAcc[id] ?? 0) + duration
            }


            if (this.session.hostname && primaryRule?.behavior.trackHostnames) {
                const hostnameKey = `${this.session.primaryRuleId}::${this.session.hostname}`
                this.hostnameTimeAcc[hostnameKey] =
                    (this.hostnameTimeAcc[hostnameKey] ?? 0) + duration
            }

            if (this.session.meta) {
                const id = this.session.primaryRuleId;
                (this.metaAcc[id] ??= []).push(this.session.meta)
            }
        }

        if (desktopBridge.isConnect()) {
            // Online path: unchanged, single event straight to the log/bridge.
            desktopBridge.send(this.buildSessionEndEvent(this.session, endTime, duration, primaryRule))
        } else {
            // Offline path: coalesce consecutive identical sessions in storage.
            // Pass a snapshot: the queued aggregation runs on a later microtask
            // by which point `this.session` may already hold the next visit.
            this.endSessionOffline(this.session, endTime, duration)
        }

        persistSession(null)

        this.session = null

        this.flush()
    }

    /**
     * Builds the standard `session_end` event for a live session.
     */
    private buildSessionEndEvent(
        session: Session,
        endAt: number,
        durationMs: number,
        primaryRule: LiveRule | undefined
    ): SessionEndEvent {
        return {
            event: "session_end",
            clientId: desktopBridge.getClientId() ?? crypto.randomUUID(),
            browserType: desktopBridge.getBrowserType(),
            ruleIds: session.ruleIds,
            primaryRuleId: session.primaryRuleId,
            category: primaryRule?.behavior.category ?? "",
            url: session.url ?? "",
            hostname: session.hostname ?? "",
            pathname: session.pathname ?? "",
            meta: session.meta ?? {},
            startedAt: session.startedAt,
            endAt,
            durationMs,
            tabId: session.tabId
        }
    }

    /**
     * Builds the `session_end` event for a flushed offline accumulator entry.
     * start/end/duration come from the aggregate, and `aggregatedFrom` exposes
     * how many original sessions were coalesced (for the Intelligence Layer).
     */
    private buildAggregatedSessionEndEvent(
        agg: AggregatedSession
    ): SessionEndEvent {
        const primaryRule = this.rules.find((rule) => rule.id === agg.primaryRuleId)

        return {
            event: "session_end",
            clientId: desktopBridge.getClientId() ?? crypto.randomUUID(),
            browserType: desktopBridge.getBrowserType(),
            ruleIds: agg.ruleIds,
            primaryRuleId: agg.primaryRuleId,
            category: primaryRule?.behavior.category ?? "",
            url: agg.url ?? "",
            hostname: agg.hostname,
            pathname: agg.pathname,
            meta: agg.meta ?? {},
            startedAt: agg.firstStart,
            endAt: agg.lastEnd,
            durationMs: agg.totalDuration,
            tabId: agg.tabId,
            aggregatedFrom: agg.aggregatedCount
        }
    }

    /**
     * Offline session end. Serialised through {@link accumulatorQueue} so
     * rapid tab switches cannot interleave storage reads/writes.
     */
    private endSessionOffline(
        session: Session,
        endTime: number,
        duration: number
    ): void {
        this.accumulatorQueue = this.accumulatorQueue
            .then(() => this.doEndSessionOffline(session, endTime, duration))
            .catch((error) => console.warn("Offline session aggregation failed:", error))
    }

    /**
     * Core merge logic. Given the just-ended session:
     *  1. identity = `${primaryRuleId}::${hostname}::${pathname}`
     *  2. if an accumulator entry exists AND the gap since its lastEnd is
     *     within the current merge tolerance → merge (no event written).
     *  3. if the gap exceeds tolerance → flush the previous aggregate as a
     *     single `session_end` event, then start a fresh accumulator.
     *  4. otherwise initialise a new accumulator entry.
     */
    private async doEndSessionOffline(
        session: Session,
        endTime: number,
        duration: number
    ): Promise<void> {
        if (duration <= 0) return

        const totalUnsynced = await this.getUnsyncedCount()
        const tolerance = await getCurrentMergeTolerance(totalUnsynced)

        const identityKey = sessionIdentityKey(
            session.primaryRuleId,
            session.hostname ?? "",
            session.pathname ?? ""
        )

        const accumulator = await loadOfflineAccumulator()
        const existing = accumulator[identityKey]

        const gap = session.startedAt - existing?.lastEnd

        if (existing && gap <= tolerance) {
            // Merge: consecutive identical session within tolerance.
            this.mergeIntoAccumulator(existing, session, endTime, duration, totalUnsynced)
            accumulator[identityKey] = existing
            await saveOfflineAccumulator(accumulator)
            return
        }

        if (existing) {
            // Gap too large (or the accumulator key changed): flush the old
            // aggregate as ONE event before starting a new group.
            delete accumulator[identityKey]
            await saveOfflineAccumulator(accumulator)
            desktopBridge.send(this.buildAggregatedSessionEndEvent(existing))
        }

        accumulator[identityKey] = {
            primaryRuleId: session.primaryRuleId,
            hostname: session.hostname ?? "",
            pathname: session.pathname ?? "",
            url: session.url ?? "",
            tabId: session.tabId,
            firstStart: session.startedAt,
            lastEnd: endTime,
            totalDuration: duration,
            longestDuration: duration,
            meta: totalUnsynced > META_PRUNING_THRESHOLD ? undefined : session.meta,
            metaPruned: totalUnsynced > META_PRUNING_THRESHOLD,
            ruleIds: session.ruleIds,
            aggregatedCount: 1
        }

        await saveOfflineAccumulator(accumulator)
    }

    /**
     * Merges a freshly-ended session into an existing accumulator entry.
     * Duration and span are exact sums; meta follows the "longest session
     * wins" heuristic (most representative content for the Intelligence
     * Layer); under extreme pressure meta is dropped entirely.
     */
    private mergeIntoAccumulator(
        existing: AggregatedSession,
        session: Session,
        endTime: number,
        duration: number,
        totalUnsynced: number
    ): void {
        existing.lastEnd = Math.max(existing.lastEnd, endTime)
        existing.totalDuration += duration
        existing.aggregatedCount += 1
        existing.tabId = session.tabId
        if (session.url) existing.url = session.url

        // Union of all rule matches so the Intelligence Layer sees the full
        // set of rules that applied across the merged window.
        existing.ruleIds = Array.from(new Set([...existing.ruleIds, ...session.ruleIds]))

        if (!existing.metaPruned && session.meta && duration > existing.longestDuration) {
            existing.longestDuration = duration
            existing.meta = session.meta
        }

        // Critically low storage: drop meta entirely to keep the entry small.
        if (totalUnsynced > META_PRUNING_THRESHOLD) {
            existing.meta = undefined
            existing.metaPruned = true
        }
    }

    /**
     * Drained on every (re)connect, BEFORE the bridge replays the event log.
     * Each accumulator entry becomes a single `session_end` event (sent through
     * `desktopBridge.send`, which persists it to the log for ack-based
     * reliability) and the accumulator is cleared progressively so a crash
     * mid-drain cannot cause double delivery on the next connect.
     */
    private flushOfflineAccumulator(): Promise<unknown> {
        this.accumulatorQueue = this.accumulatorQueue
            .then(async () => {
                const accumulator = await loadOfflineAccumulator()
                const keys = Object.keys(accumulator)

                if (!keys.length) return

                for (const key of keys) {
                    const agg = accumulator[key]
                    delete accumulator[key]
                    await saveOfflineAccumulator(accumulator)
                    await desktopBridge.send(this.buildAggregatedSessionEndEvent(agg))
                }

                await clearOfflineAccumulator()
            })
            .catch((error) => console.warn("Accumulator flush failed:", error))

        return this.accumulatorQueue
    }

    /**
     * Total pending (unsynced) event count = unsynced log entries + number of
     * accumulator entries (each represents one future event).
     */
    private async getUnsyncedCount(): Promise<number> {
        const accumulator = await loadOfflineAccumulator()
        const logUnsynced = await desktopBridge.getUnsyncedCount()
        return logUnsynced + Object.keys(accumulator).length
    }

    private async resolveSessionMeta(tabId: number, rule: LiveRule): Promise<PageMeta | null> {
        const cached = this.metaCache.get(tabId)

        if (cached) return cached

        try {
            const message: RequestMetaMessage = {
                type: "REQUEST_META",
                metaFields: rule.metaFields,
                includeTerms: rule.include
            }

            const meta = (await chrome.tabs.sendMessage(tabId, message)) as PageMeta | undefined

            if (meta) {
                this.metaCache.set(tabId, meta)
                return meta
            }

        } catch (error) { }

        return null
    }

    receivePageMeta(tabId: number, meta: PageMeta, url: string): void {

        this.metaCache.set(tabId, meta)

        if (this.session?.tabId === tabId && this.session?.primaryRuleId && !this.session?.meta) {
            chrome.tabs.get(tabId)
                .then((tab) => {
                    if (tab.url === url && this.session?.tabId === tabId) {
                        const rule = this.rules.find(
                            (rule) => rule.id === this.session?.primaryRuleId
                        )

                        if (rule?.needsMeta) this.session.meta = meta
                    }
                })
                .catch(() => { })
        }
    }

    private recoverOrphanedSession(orphan: PersistedSession): void {
        const duration = Date.now() - orphan.startedAt

        if (duration <= 0) return

        console.log(`Recovering orphaned session: ${orphan.ruleIds} - ${duration}ms`)

        for (const id of orphan.ruleIds) this.timeAcc[id] = (this.timeAcc[id] ?? 0) + duration

        persistSession(null)
    }

    private async flush(): Promise<void> {

        const hasTime = Object.keys(this.timeAcc).length > 0
        const hasMeta = Object.keys(this.metaAcc).length > 0
        const hasHostname = Object.keys(this.hostnameTimeAcc).length > 0

        if (!hasMeta && !hasTime && !hasHostname) return

        const timeSnap = this.timeAcc
        const metaSnap = this.metaAcc
        const hostnameSnap = this.hostnameTimeAcc

        this.timeAcc = {}
        this.metaAcc = {}
        this.hostnameTimeAcc = {}

        try {
            await Promise.all([
                hasTime ? flushTime(timeSnap) : Promise.resolve(),
                hasMeta ? flushMeta(metaSnap) : Promise.resolve(),
                hasHostname ? flushHostnameTime(hostnameSnap) : Promise.resolve()
            ])
        } catch (error) {
            console.warn("Flush failed. Restoring accumuators: ", error)

            for (const [id, ms] of Object.entries(timeSnap)) this.timeAcc[id] = (this.timeAcc[id] ?? 0) + ms

            for (const [id, metas] of Object.entries(metaSnap)) (this.metaAcc[id] ??= []).push(...metas)

            for (const [key, ms] of Object.entries(hostnameSnap)) this.hostnameTimeAcc[key] = (this.hostnameTimeAcc[key] ?? 0) + ms

        }
    }

    getSession() {
        return this.session
    }

    getRules() {
        return this.rules
    }

    getTimeAccumulator() {
        return {
            ...this.timeAcc
        }
    }

    getHostnameTimeAccumulator() {
        return { ...this.hostnameTimeAcc }
    }

    updateRules(rules: Array<Rule>): void {
        saveRules(rules)
        enforcement.setRules(compileRules(rules))
    }

    /**
     * Desktop-driven intervention (e.g. AI noticed a drift). We record the
     * active intervention so evaluateAccess never stacks a second overlay, then
     * dispatch the overlay to the tab.
     */
    forceIntervention(
        tabId: number,
        options: {
            taskType: InterventionTaskType
            params?: Record<string, unknown>
            durationSec: number
            tasks: Array<Task>
        }
    ): void {
        if (!tabId) return

        const { taskType, params, durationSec, tasks } = options

        enforcement.beginIntervention(
            tabId,
            DESKTOP_DRIVEN_RULE_ID,
            "",
            durationSec
        )

        const message: InterventionMessage = {
            type: "show_intervention",
            tabId,
            taskType,
            params,
            durationSec,
            tasks
        }

        void chrome.tabs.sendMessage(tabId, message).catch(() => { })
    }

    setFocusMode(mode: { active: boolean; workRuleIds?: Array<string> }): void {
        enforcement.setFocusMode(mode)
    }

    getFocusMode() {
        return enforcement.getFocusMode()
    }
}

export const tracker = new VinayaTracker()
