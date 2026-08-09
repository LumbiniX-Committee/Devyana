import { META_KEY, RULES_KEY, SESSION_KEY, TIME_KEY, type PageMeta, type Rule, type Task } from "@vinaya/behavior-core";

export async function loadRules(): Promise<Array<Rule> | null> {
    const data = await chrome.storage.local.get(RULES_KEY)

    return (data[RULES_KEY] as Array<Rule> | undefined) ?? null
}

export async function saveRules(rules: Array<Rule>): Promise<void> {
    await chrome.storage.local.set({ [RULES_KEY]: rules })
}

export async function flushTime(deltas: Record<string, number>): Promise<void> {
    const ids = Object.keys(deltas)

    if (!ids.length) return

    const keys = ids.map(TIME_KEY)
    const current = await chrome.storage.local.get(keys)

    const updates: Record<string, number> = {}

    for (const id of ids) {
        updates[TIME_KEY(id)] = ((current[TIME_KEY(id)] as number | undefined) ?? 0) + deltas[id]
    }

    await chrome.storage.local.set(updates)
}

const META_CAP = 500

export async function flushMeta(entries: Record<string, Array<PageMeta>>): Promise<void> {
    const ids = Object.keys(entries)

    if (!ids.length) return

    const keys = ids.map(META_KEY)
    const current = await chrome.storage.local.get(keys)

    const updates: Record<string, Array<PageMeta>> = {}

    for (const id of ids) {
        const prev = (current[META_KEY(id)] as Array<PageMeta> | undefined) ?? []
        const merged = [...prev, ...entries[id]]
        updates[META_KEY(id)] = merged.length > META_CAP ? merged.slice(-META_CAP) : merged
    }

    await chrome.storage.local.set(updates)
}


export async function readAllTime(ids: Array<string>): Promise<Record<string, number>> {
    const keys = ids.map(TIME_KEY)
    const data = await chrome.storage.local.get(keys)

    return Object.fromEntries(
        ids.map(id => [id, (data[TIME_KEY(id)] as number | undefined) ?? 0])
    )
}

export async function readMeta(id: string): Promise<Array<PageMeta>> {
    const data = await chrome.storage.local.get(META_KEY(id))

    return (data[META_KEY(id)] as Array<PageMeta> | undefined) ?? []
}


export type PersistedSession = {
    ruleIds: Array<string>;
    primaryRuleId: string;
    tabId: number;
    startedAt: number;
    hostname?: string;
    pathname?: string;
}

export async function persistSession(session: PersistedSession | null): Promise<void> {
    if (session === null) {
        await chrome.storage.local.remove(SESSION_KEY)
    } else {
        await chrome.storage.local.set({
            [SESSION_KEY]: session
        })
    }
}

export async function loadPersistedSession(): Promise<PersistedSession | null> {
    const data = await chrome.storage.local.get(SESSION_KEY)

    return (data[SESSION_KEY] as PersistedSession | undefined) ?? null
}

export const HOSTNAME_TIME_KEY = (ruleId: string, hostname: string) =>
    `vinaya_htime_${ruleId}::${hostname}`

export async function flushHostnameTime(
    deltas: Record<string, number>
): Promise<void> {
    if (!Object.keys(deltas).length) return

    const storageKeys = Object.keys(deltas).map(k => {
        const [ruleId, hostname] = k.split("::")
        return HOSTNAME_TIME_KEY(ruleId, hostname)
    })

    const current = await chrome.storage.local.get(storageKeys)
    const updates: Record<string, number> = {}

    for (const [compositeKey, ms] of Object.entries(deltas)) {
        const [ruleId, hostname] = compositeKey.split("::")
        const storeKey = HOSTNAME_TIME_KEY(ruleId, hostname)
        updates[storeKey] = ((current[storeKey] as number | undefined) ?? 0) + ms
    }

    await chrome.storage.local.set(updates)
}


export async function readHostnameTimeForRule(
    ruleId: string
): Promise<Record<string, number>> {
    const prefix = `vinaya_htime_${ruleId}::`
    const allData = await chrome.storage.local.get() as Record<string, unknown>
    const result: Record<string, number> = {}

    for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith(prefix)) {
            const hostname = key.slice(prefix.length)
            result[hostname] = value as number
        }
    }

    return result
}

// ---------------------------------------------------------------------------
// Offline session aggregation
//
// When the desktop bridge is unreachable we no longer write a `session_end`
// event per page visit. Instead consecutive visits to the same identity
// (primaryRuleId + hostname + pathname) are merged into a single in-storage
// accumulator entry that becomes ONE `session_end` event when flushed. This
// keeps storage pressure bounded while preserving full fidelity: total
// duration and time span are exact, never approximated.
// ---------------------------------------------------------------------------

export const OFFLINE_ACCUMULATOR_KEY = "vinaya_offline_accumulator"
export const MERGE_TOLERANCE_STEP_KEY = "vinaya_merge_tolerance_step"

/**
 * Minimum, exact sum/span of a run of merged sessions. Everything here mirrors
 * the fields the Intelligence Layer consumes on a normal `session_end` event,
 * so a flushed accumulator entry is a drop-in replacement.
 */
export type AggregatedSession = {
    primaryRuleId: string;
    hostname: string;
    pathname: string;
    url: string;
    tabId: number;
    /** Timestamp of the earliest merged session (startedAt of the event). */
    firstStart: number;
    /** Timestamp of the latest merged session (endAt of the event). */
    lastEnd: number;
    /** Sum of all merged durations (durationMs of the event). */
    totalDuration: number;
    /**
     * Duration of the single session whose `meta` is currently kept. Used by
     * the "keep the meta of the longest session" heuristic.
     */
    longestDuration: number;
    /** Meta of the longest (or last kept) merged session. */
    meta?: PageMeta;
    /** True once meta has been dropped to save space under storage pressure. */
    metaPruned: boolean;
    /** Rule matches; union of every merged session (for the Intelligence Layer). */
    ruleIds: Array<string>;
    /** Count of original sessions merged into this entry (-> `aggregatedFrom`). */
    aggregatedCount: number;
}

/**
 * Identity key for aggregation. Consecutive sessions sharing this key are
 * candidates for merging if the gap between them is within tolerance. A rule
 * priority change while offline yields a different primaryRuleId and therefore
 * a distinct accumulator group (acceptable fragmentation, per requirements).
 */
export function sessionIdentityKey(
    primaryRuleId: string,
    hostname: string,
    pathname: string
): string {
    return `${primaryRuleId}::${hostname}::${pathname}`
}

export async function loadOfflineAccumulator(): Promise<
    Record<string, AggregatedSession>
> {
    const data = await chrome.storage.local.get(OFFLINE_ACCUMULATOR_KEY)
    return (data[OFFLINE_ACCUMULATOR_KEY] as
        | Record<string, AggregatedSession>
        | undefined) ?? {}
}

export async function saveOfflineAccumulator(
    accumulator: Record<string, AggregatedSession>
): Promise<void> {
    await chrome.storage.local.set({
        [OFFLINE_ACCUMULATOR_KEY]: accumulator
    })
}

export async function clearOfflineAccumulator(): Promise<void> {
    await chrome.storage.local.remove(OFFLINE_ACCUMULATOR_KEY)
}

// ---------------------------------------------------------------------------
// Merge tolerance (sliding temporal granularity)
//
// The merge tolerance (minGapMs) is the minimum separation required to treat
// two consecutive identical sessions as distinct. It starts at 0ms (exact
// behaviour, nothing merged) and GROWS EXPONENTIALLY with the number of
// unsynced events. Fewer, larger time-slices means less storage pressure while
// the desktop bridge is down; once the backlog drains, the tolerance shrinks
// back automatically and recording returns to full granularity.
//
// step  :  total unsynced range            : tolerance
//   -1  : 0 - 999                          : 0        (off - exact recording)
//    0  : 1000 - 1999                      : 30,000   (30s)
//    1  : 2000 - 3999                      : 60,000   (1m)
//    2  : 4000 - 7999                      : 120,000  (2m)
//    k  : [1000*2^k, 1000*2^(k+1) - 1]    : 30,000 * 2^k
//
// The *step* (not the raw tolerance) is persisted so the same sequence of
// sessions and connection state always yields the same aggregation — the
// compression is deterministic and survives service-worker restarts.
// ---------------------------------------------------------------------------

export const MERGE_TOLERANCE_BASE_MS = 30_000
export const MERGE_TOLERANCE_FLOOR = 1_000

/** Number of unsynced entries above which aggregated meta is dropped entirely. */
export const META_PRUNING_THRESHOLD = 5_000

function computeToleranceStep(totalUnsynced: number): number {
    if (totalUnsynced < MERGE_TOLERANCE_FLOOR) return -1

    let step = 0
    let upper = MERGE_TOLERANCE_FLOOR * 2

    while (totalUnsynced >= upper) {
        step++
        upper *= 2
    }

    return step
}

function toleranceForStep(step: number): number {
    if (step < 0) return 0
    return MERGE_TOLERANCE_BASE_MS * 2 ** step
}

export async function loadMergeToleranceStep(): Promise<number> {
    const data = await chrome.storage.local.get(MERGE_TOLERANCE_STEP_KEY)
    return (data[MERGE_TOLERANCE_STEP_KEY] as number | undefined) ?? -1
}

export async function saveMergeToleranceStep(step: number): Promise<void> {
    await chrome.storage.local.set({ [MERGE_TOLERANCE_STEP_KEY]: step })
}

/**
 * Returns the merge tolerance currently in effect for `totalUnsynced` events
 * (log entries + accumulator entries) and persists the step for determinism.
 */
export async function getCurrentMergeTolerance(
    totalUnsynced: number
): Promise<number> {
    const storedStep = await loadMergeToleranceStep()
    const step = computeToleranceStep(totalUnsynced)

    if (step !== storedStep) await saveMergeToleranceStep(step)

    return toleranceForStep(step)
}

/**
 * Forces the tolerance to at least `minStep`. Used when the bridge switches to
 * passive mode: a long offline window is likely, so we apply 30s of merging
 * immediately instead of waiting for the log to grow.
 */
export async function forceMinMergeTolerance(minStep: number): Promise<void> {
    const storedStep = await loadMergeToleranceStep()
    if (storedStep < minStep) await saveMergeToleranceStep(minStep)
}

// ---------------------------------------------------------------------------
// Intervention support storage
//
// Task list, focus-mode state and per-rule cooldown timestamps all live in
// `chrome.storage.local` so the enforcement engine is fully deterministic and
// survives background-service-worker restarts. None of this requires the
// desktop bridge to be reachable.
// ---------------------------------------------------------------------------

export const TASKS_KEY = "viyana_tasks"
export const FOCUS_MODE_KEY = "viyana_focus_mode"
export const COOLDOWNS_KEY = "viyana_intervention_cooldowns"

export async function loadTasks(): Promise<Array<Task>> {
    const data = await chrome.storage.local.get(TASKS_KEY)

    const tasks = data[TASKS_KEY] as Array<Task> | undefined

    if (!Array.isArray(tasks)) return []
    return tasks.filter(t => t && typeof t.id === "string" && typeof t.title === "string")
}

export async function saveTasks(tasks: Array<Task>): Promise<void> {
    await chrome.storage.local.set({ [TASKS_KEY]: tasks })
}

export type FocusModeState = {
    active: boolean;
    workRuleIds?: Array<string>;
}

export async function loadFocusMode(): Promise<FocusModeState> {
    const data = await chrome.storage.local.get(FOCUS_MODE_KEY)
    const mode = data[FOCUS_MODE_KEY] as FocusModeState | undefined

    if (typeof mode?.active !== "boolean") {
        return { active: false, workRuleIds: [] }
    }

    return {
        active: mode.active,
        workRuleIds: Array.isArray(mode.workRuleIds) ? mode.workRuleIds : []
    }
}

export async function saveFocusMode(mode: FocusModeState): Promise<void> {
    await chrome.storage.local.set({
        [FOCUS_MODE_KEY]: {
            active: Boolean(mode.active),
            workRuleIds: Array.isArray(mode.workRuleIds) ? mode.workRuleIds : []
        }
    })
}

export async function loadInterventionCooldowns(): Promise<Record<string, number>> {
    const data = await chrome.storage.local.get(COOLDOWNS_KEY)
    const cooldowns = data[COOLDOWNS_KEY] as Record<string, number> | undefined
    const now = Date.now()

    if (!cooldowns || typeof cooldowns !== "object") return {}
    return Object.fromEntries(
        Object.entries(cooldowns).filter(([, until]) => typeof until === "number" && until > now)
    )
}

export async function saveInterventionCooldowns(
    cooldowns: Record<string, number>
): Promise<void> {
    await chrome.storage.local.set({ [COOLDOWNS_KEY]: cooldowns })
}