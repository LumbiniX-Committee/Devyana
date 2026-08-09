import { sendToBackground } from "@plasmohq/messaging";
import { useCallback, useEffect, useState } from "react";
import type { InterventionTaskType } from "@vinaya/behavior-core";
import type { LiveRule } from "@vinaya/behavior-core";
import "./style.css";

type ConnectionStatus = {
    connected: boolean;
    port: number | null;
    passiveMode: boolean;
    unsyncedCount: number;
    clientId: string | null;
    browserType: string;
};

type TabInfo = {
    id: number;
    url: string;
    hostname: string;
    title: string;
} | null;

type CooldownStatus = {
    onCooldown: boolean;
    until?: number;
    ruleId?: string;
};

type InterventionType = {
    id: InterventionTaskType;
    label: string;
    description: string;
    implemented: boolean;
    params: InterventionParam[];
};

type InterventionParam = {
    key: string;
    label: string;
    type: "number" | "text";
    default: string | number;
    placeholder?: string;
};

const INTERVENTION_TYPES: InterventionType[] = [
    {
        id: "inhale_exhale",
        label: "Inhale & Exhale",
        description: "Guided breathing exercise with visual circle",
        implemented: true,
        params: [
            { key: "durationSec", label: "Duration (seconds)", type: "number", default: 30, placeholder: "30" }
        ]
    },
    {
        id: "realization",
        label: "Realization",
        description: "Reflective question with text input",
        implemented: true,
        params: [
            { key: "question", label: "Question", type: "text", default: "", placeholder: "What were you about to do?" },
            { key: "minChars", label: "Min characters", type: "number", default: 20, placeholder: "20" }
        ]
    },
    {
        id: "divine_followups",
        label: "Divine Follow-ups",
        description: "Sequence of mindfulness prompts",
        implemented: true,
        params: [
            { key: "stepDurationSec", label: "Step duration (seconds)", type: "number", default: 8, placeholder: "8" }
        ]
    },
    {
        id: "quiz",
        label: "Quiz",
        description: "Interactive quiz (coming soon)",
        implemented: false,
        params: []
    },
    {
        id: "story",
        label: "Story",
        description: "Guided story (coming soon)",
        implemented: false,
        params: []
    },
    {
        id: "challenge",
        label: "Challenge",
        description: "Micro-challenge (coming soon)",
        implemented: false,
        params: []
    }
];

function IndexPopup() {
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
    const [currentTab, setCurrentTab] = useState<TabInfo>(null);
    const [retrying, setRetrying] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

    const [selectedType, setSelectedType] = useState<InterventionTaskType>("inhale_exhale");
    const [interventionParams, setInterventionParams] = useState<Record<string, string | number>>({});
    const [triggering, setTriggering] = useState(false);
    const [cooldown, setCooldown] = useState<CooldownStatus>({ onCooldown: false });
    const [rules, setRules] = useState<LiveRule[]>([]);

    const showToast = useCallback((message: string, type: "success" | "error") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await Promise.race([
                sendToBackground<undefined, ConnectionStatus>({ name: "get-connection-status" }),
                new Promise<ConnectionStatus>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 3000)
                )
            ]);
            setConnectionStatus(data);
        } catch (err) {
            console.error("Failed to fetch connection status:", err);
            setConnectionStatus({
                connected: false,
                port: null,
                passiveMode: false,
                unsyncedCount: 0,
                clientId: null,
                browserType: "unknown"
            });
        }
    }, []);

    const fetchCurrentTab = useCallback(async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id && tab.url) {
                const url = new URL(tab.url);
                setCurrentTab({
                    id: tab.id,
                    url: tab.url,
                    hostname: url.hostname,
                    title: tab.title || ""
                });
            } else {
                setCurrentTab(null);
            }
        } catch (err) {
            console.error("Failed to fetch current tab:", err);
            setCurrentTab(null);
        }
    }, []);

    const fetchCooldown = useCallback(async (hostname: string) => {
        if (!hostname) {
            setCooldown({ onCooldown: false });
            return;
        }
        try {
            const data = await sendToBackground<{ hostname: string }, CooldownStatus>({
                name: "cooldown-status",
                body: { hostname }
            });
            setCooldown(data);
        } catch (err) {
            console.error("Failed to fetch cooldown:", err);
            setCooldown({ onCooldown: false });
        }
    }, []);

    const fetchRules = useCallback(async () => {
        try {
            const data = await Promise.race([
                sendToBackground<undefined, { rules: LiveRule[] }>({ name: "get-rules" }),
                new Promise<{ rules: LiveRule[] }>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 3000)
                )
            ]);
            setRules(data.rules);
        } catch (err) {
            console.error("Failed to fetch rules:", err);
            setRules([]);
        }
    }, []);

    const retryConnection = useCallback(async () => {
        setRetrying(true);
        try {
            await sendToBackground<undefined, { ok: boolean; error?: string }>({ name: "retry-connection" });
            await new Promise(r => setTimeout(r, 1000));
            await fetchStatus();
        } catch (err) {
            showToast(`Retry failed: ${String(err)}`, "error");
        } finally {
            setRetrying(false);
        }
    }, [fetchStatus, showToast]);

    const triggerIntervention = useCallback(async () => {
        if (!currentTab?.id || triggering) return;

        const typeConfig = INTERVENTION_TYPES.find(t => t.id === selectedType);
        if (!typeConfig?.implemented) {
            showToast("This intervention type is not yet implemented", "error");
            return;
        }

        setTriggering(true);
        try {
            const params: Record<string, unknown> = {};
            for (const param of typeConfig.params) {
                const value = interventionParams[param.key] ?? param.default;
                params[param.key] = param.type === "number" ? Number(value) : value;
            }

            const result = await sendToBackground<{ tabId: number; taskType: InterventionTaskType; params?: Record<string, unknown>; durationSec?: number }, { ok: boolean; error?: string }>({
                name: "trigger-intervention",
                body: {
                    tabId: currentTab.id,
                    taskType: selectedType,
                    params,
                    durationSec: params.durationSec as number | undefined
                }
            });

            if (result.ok) {
                showToast("Intervention triggered", "success");
                await fetchCooldown(currentTab.hostname);
            } else {
                showToast(result.error || "Failed to trigger intervention", "error");
            }
        } catch (err) {
            showToast(`Error: ${String(err)}`, "error");
        } finally {
            setTriggering(false);
        }
    }, [currentTab, selectedType, interventionParams, fetchCooldown, triggering, showToast]);

    const clearLog = useCallback(async () => {
        try {
            await sendToBackground<undefined, { ok: boolean; error?: string }>({ name: "prune-log" });
            await fetchStatus();
            showToast("Event log cleared", "success");
        } catch (err) {
            showToast(`Failed to clear log: ${String(err)}`, "error");
        }
    }, [fetchStatus, showToast]);

    const openDashboard = useCallback(() => {
        void chrome.tabs.create({ url: chrome.runtime.getURL("tabs/setup.html") });
    }, []);

    useEffect(() => {
        fetchStatus();
        fetchCurrentTab();
        fetchRules();
        const interval = setInterval(() => {
            fetchStatus();
            fetchCurrentTab();
        }, 2000);
        return () => clearInterval(interval);
    }, [fetchStatus, fetchCurrentTab, fetchRules]);

    useEffect(() => {
        if (currentTab?.hostname) {
            fetchCooldown(currentTab.hostname);
        }
    }, [currentTab?.hostname, fetchCooldown]);

    useEffect(() => {
        const typeConfig = INTERVENTION_TYPES.find(t => t.id === selectedType);
        if (typeConfig) {
            const defaults: Record<string, string | number> = {};
            for (const param of typeConfig.params) {
                defaults[param.key] = param.default;
            }
            setInterventionParams(defaults);
        }
    }, [selectedType]);

    if (!connectionStatus) {
        return (
            <div className="w-[360px] h-[500px] bg-zinc-950 p-4 font-sans text-zinc-100 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-400 border-t-transparent" />
            </div>
        );
    }

    const typeConfig = INTERVENTION_TYPES.find(t => t.id === selectedType);
    const canTrigger = currentTab?.id && !cooldown.onCooldown && typeConfig?.implemented && !triggering;
    const isBrowserPage = currentTab?.url.startsWith("chrome://") || currentTab?.url.startsWith("chrome-extension://") || currentTab?.url.startsWith("edge://") || currentTab?.url.startsWith("about:");

    return (
        <div className="w-[360px] h-[500px] bg-zinc-950 p-4 font-sans text-zinc-100 overflow-y-auto">
            <header className="mb-4 flex items-center justify-between">
                <h1 className="text-base font-semibold tracking-wide">
                    Viyana <span className="text-emerald-400">Control</span>
                </h1>
                <button
                    onClick={() => void fetchStatus()}
                    type="button"
                    className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800"
                >
                    Refresh
                </button>
            </header>

            <section className="mb-4 space-y-2 p-3 rounded-lg border border-zinc-800 bg-zinc-900/60">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">Connection</span>
                    <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${connectionStatus.connected ? "bg-emerald-400" : "bg-rose-500"}`} />
                        <span className="text-xs font-medium">
                            {connectionStatus.connected ? "Connected" : "Disconnected"}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                        <span className="text-zinc-500">Port</span>
                        <div className="font-mono text-zinc-200">
                            {connectionStatus.port ? `Port ${connectionStatus.port}` : "—"}
                        </div>
                    </div>
                    <div>
                        <span className="text-zinc-500">Unsynced</span>
                        <div className="font-mono text-zinc-200">
                            {connectionStatus.unsyncedCount} event{connectionStatus.unsyncedCount !== 1 ? "s" : ""} pending sync
                        </div>
                    </div>
                </div>

                {connectionStatus.passiveMode && (
                    <div className="mt-2 p-2 rounded-md bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-[11px]">
                        ⚠ Desktop app not found. Data will be stored locally and synced later.
                    </div>
                )}

                <div className="mt-2 flex items-center gap-2">
                    <button
                        onClick={() => void retryConnection()}
                        disabled={retrying || connectionStatus.connected}
                        type="button"
                        className="flex-1 rounded-md border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {retrying ? (
                            <span className="flex items-center justify-center gap-1.5">
                                <span className="animate-spin h-3 w-3 border-2 border-emerald-400 border-t-transparent rounded-full" />
                                Retrying…
                            </span>
                        ) : (
                            "Retry Connection"
                        )}
                    </button>
                    <button
                        onClick={() => void clearLog()}
                        type="button"
                        className="rounded-md border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800"
                    >
                        Clear Synced Events
                    </button>
                </div>
            </section>

            <section className="mb-4 space-y-3">
                <h2 className="text-sm font-medium text-zinc-300">Buddha's Palm Test</h2>

                {currentTab ? (
                    <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-zinc-500">Active Tab</span>
                            {!isBrowserPage && currentTab.id && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800">
                                    Injectible
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-zinc-400 truncate" title={currentTab.url}>
                            {currentTab.hostname}
                        </p>
                        <p className="text-[10px] text-zinc-600 truncate" title={currentTab.url}>
                            {currentTab.url}
                        </p>
                        {isBrowserPage && (
                            <p className="mt-1 text-[10px] text-rose-400">Cannot inject into browser pages</p>
                        )}
                    </div>
                ) : (
                    <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 text-center">
                        <p className="text-xs text-rose-400">No accessible tab found</p>
                    </div>
                )}

                <div className="space-y-2">
                    <span className="text-xs text-zinc-500">Intervention Type</span>
                    <div className="flex flex-wrap gap-1">
                        {INTERVENTION_TYPES.map(type => (
                            <button
                                key={type.id}
                                onClick={() => setSelectedType(type.id)}
                                disabled={!type.implemented}
                                type="button"
                                className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                                    selectedType === type.id
                                        ? "bg-emerald-600 text-white"
                                        : type.implemented
                                        ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                                        : "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
                                }`}
                                title={type.implemented ? type.description : `${type.description} — Coming soon`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>
                </div>

                {typeConfig?.implemented && typeConfig.params.length > 0 && (
                    <div className="space-y-2 p-3 rounded-lg border border-zinc-800 bg-zinc-900/60">
                        <span className="text-xs text-zinc-500">Parameters</span>
                        <div className="space-y-2">
                            {typeConfig.params.map(param => (
                                <div key={param.key} className="space-y-1">
                                    <label htmlFor={`param-${param.key}`} className="text-[11px] text-zinc-400">{param.label}</label>
                                    {param.type === "number" ? (
                                        <input
                                            id={`param-${param.key}`}
                                            type="number"
                                            value={interventionParams[param.key] as number}
                                            onChange={e => setInterventionParams(p => ({ ...p, [param.key]: Number(e.target.value) }))}
                                            placeholder={param.placeholder}
                                            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                                            min="1"
                                        />
                                    ) : (
                                        <input
                                            id={`param-${param.key}`}
                                            type="text"
                                            value={interventionParams[param.key] as string}
                                            onChange={e => setInterventionParams(p => ({ ...p, [param.key]: e.target.value }))}
                                            placeholder={param.placeholder}
                                            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {cooldown.onCooldown && (
                    <div className="p-3 rounded-lg border border-rose-700 bg-rose-900/30">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-rose-300">Cooldown Active</span>
                            <CooldownTimer until={cooldown.until} />
                        </div>
                        <p className="text-[10px] text-rose-400 mt-1">
                            Rule: <span className="font-mono">{cooldown.ruleId}</span>
                        </p>
                    </div>
                )}

                <button
                    onClick={() => void triggerIntervention()}
                    disabled={!canTrigger || isBrowserPage}
                    type="button"
                    className={`w-full rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        canTrigger && !isBrowserPage
                            ? "bg-emerald-600 text-white hover:bg-emerald-500"
                            : "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
                    }`}
                >
                    {triggering ? "Triggering…" : "Trigger Intervention"}
                </button>

                {isBrowserPage && (
                    <p className="text-center text-[10px] text-rose-400">Cannot trigger on browser pages</p>
                )}
            </section>

            <section className="mb-4 space-y-2">
                <h2 className="text-sm font-medium text-zinc-300">Quick Settings / Debug</h2>

                <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60">
                    <span className="text-xs text-zinc-500">Emit Rule Filter Preview</span>
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {rules.length === 0 ? (
                            <p className="text-[11px] text-zinc-500">Loading rules…</p>
                        ) : (
                            rules
                                .filter(r => r.behavior.emit !== "fallback")
                                .slice(0, 8)
                                .map(rule => (
                                    <div
                                        key={rule.id}
                                        className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-zinc-900"
                                    >
                                        <span className="text-zinc-300 truncate pr-2">{rule.id}</span>
                                        <span
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                                rule.behavior.emit === "never"
                                                    ? "bg-rose-900/50 text-rose-300 border border-rose-700"
                                                    : rule.behavior.emit === "always"
                                                    ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700"
                                                    : "bg-amber-900/50 text-amber-300 border border-amber-700"
                                            }`}
                                        >
                                            {rule.behavior.emit}
                                        </span>
                                    </div>
                                ))
                        )}
                    </div>
                    {rules.length > 8 && (
                        <p className="mt-1 text-[10px] text-zinc-600">
                            +{rules.length - 8} more rules
                        </p>
                    )}
                </div>

                <button
                    onClick={() => void openDashboard()}
                    type="button"
                    className="w-full rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
                >
                    Open Dashboard
                </button>
            </section>

            {toast && (
                <div
                    className={`fixed bottom-4 left-4 right-4 max-w-[360px] rounded-md px-3 py-2 text-xs font-medium animate-slide-up ${
                        toast.type === "success"
                            ? "bg-emerald-900/90 text-emerald-200 border border-emerald-700"
                            : "bg-rose-900/90 text-rose-200 border border-rose-700"
                    }`}
                    role="alert"
                >
                    {toast.message}
                </div>
            )}

            <style>{`
                @keyframes slide-up {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up { animation: slide-up 200ms ease-out; }
            `}</style>
        </div>
    );
}

function CooldownTimer({ until }: { until?: number }) {
    const [remaining, setRemaining] = useState(0);

    useEffect(() => {
        if (!until) return;
        const update = () => {
            const ms = until - Date.now();
            if (ms <= 0) {
                setRemaining(0);
                return;
            }
            setRemaining(ms);
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [until]);

    if (remaining <= 0) return <span className="text-emerald-300">Expired</span>;

    const seconds = Math.ceil(remaining / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return <span className="font-mono tabular-nums">{mins}:{secs.toString().padStart(2, "0")}</span>;
}

export default IndexPopup;