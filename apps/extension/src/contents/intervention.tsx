import { useEffect, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { PlasmoCSConfig } from "plasmo"
import type {
    InterventionActiveMessage,
    InterventionCompletedMessage,
    InterventionMessage,
    Task
} from "@vinaya/behavior-core"

export const config: PlasmoCSConfig = {
    matches: ["<all_urls>"],
    run_at: "document_idle"
}

const DASHBOARD_URL = chrome.runtime.getURL("tabs/setup.html")

// Only the top frame should host the intervention overlay; iframes would just
// duplicate it and fight over the viewport.
if (window.top === window) {
    chrome.runtime.onMessage.addListener((message: InterventionMessage) => {
        if (message?.type !== "show_intervention") return
        mountIntervention(message)
    })
}

// ---------------------------------------------------------------------------
// Page lockdown: the overlay must feel non-negotiable. We pin the document so
// it cannot scroll, block every keyboard event at capture time, and disable
// pointer events for everything except the overlay's own shadow root.
// ---------------------------------------------------------------------------

type PageLock = {
    overflow: string;
    pointerEvents: string;
}

function lockPage(): () => void {
    const rootEl = document.documentElement
    const prev: PageLock = {
        overflow: rootEl.style.overflow,
        pointerEvents: rootEl.style.pointerEvents
    }

    rootEl.style.overflow = "hidden"
    rootEl.style.pointerEvents = "none"

    const swallow = (event: Event) => {
        event.preventDefault()
        event.stopPropagation()
    }

    document.addEventListener("keydown", swallow, true)
    document.addEventListener("keyup", swallow, true)

    return () => {
        rootEl.style.overflow = prev.overflow
        rootEl.style.pointerEvents = prev.pointerEvents
        document.removeEventListener("keydown", swallow, true)
        document.removeEventListener("keyup", swallow, true)
    }
}

function sendActive(tabId?: number): void {
    const message: InterventionActiveMessage = { type: "intervention_active", tabId }
    void chrome.runtime.sendMessage(message)
}

function sendCompleted(tabId: number | undefined, completed: boolean): void {
    const message: InterventionCompletedMessage = {
        type: "intervention_completed",
        tabId,
        completed
    }
    void chrome.runtime.sendMessage(message)
}

let mounted: { root: Root; host: HTMLDivElement } | null = null
let unlock: (() => void) | null = null

function mountIntervention(message: InterventionMessage): void {
    if (mounted) return

    const host = document.createElement("div")
    host.dataset.frocusIntervention = "true"

    const shadow = host.attachShadow({ mode: "open" })

    const style = document.createElement("style")
    style.textContent = OVERLAY_STYLE
    shadow.appendChild(style)

    const container = document.createElement("div")
    shadow.appendChild(container)

    document.documentElement.appendChild(host)

    const root = createRoot(container)
    mounted = { root, host }

    unlock = lockPage()

    sendActive(message.tabId)

    root.render(
        <InterventionOverlay
            durationSec={message.durationSec}
            tasks={message.tasks}
            tabId={message.tabId}
        />
    )
}

function unmountIntervention(): void {
    if (!mounted) return

    mounted.root.unmount()
    mounted.host.remove()
    mounted = null

    if (unlock) {
        unlock()
        unlock = null
    }
}

// ---------------------------------------------------------------------------
// React overlay component
// ---------------------------------------------------------------------------

interface InterventionOverlayProps {
    durationSec: number
    tasks: Array<Task>
    tabId?: number
}

type Phase = "breathing" | "tasks"

function InterventionOverlay({ durationSec, tasks, tabId }: InterventionOverlayProps) {
    const totalSec = Math.max(1, durationSec)
    const [remaining, setRemaining] = useState(totalSec)
    const [phase, setPhase] = useState<Phase>("breathing")
    const [breathIn, setBreathIn] = useState(true)
    const [canChooseLater, setCanChooseLater] = useState(false)

    useEffect(() => {
        const timer = window.setInterval(() => {
            setRemaining((prev) => {
                if (prev <= 1) {
                    setPhase("tasks")
                    return 0
                }
                return prev - 1
            })
        }, 1_000)

        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
        const breath = window.setInterval(() => {
            setBreathIn((value) => !value)
        }, 4_000)

        return () => window.clearInterval(breath)
    }, [])

    useEffect(() => {
        const delayed = window.setTimeout(() => {
            setCanChooseLater(true)
        }, 10_000)

        return () => window.clearTimeout(delayed)
    }, [])

    const handleTask = (task: Task) => {
        sendCompleted(tabId, true)
        unmountIntervention()
        if (task.url) {
            // Steer the current tab back to the task.
            window.location.href = task.url
        } else {
            // Fallback: open the dashboard so the user can choose a task.
            window.open(DASHBOARD_URL, "_blank")
        }
    }

    const handleChooseLater = () => {
        sendCompleted(tabId, false)
        unmountIntervention()
    }

    const progress = totalSec <= 0 ? 0 : remaining / totalSec
    const ringRadius = 54
    const ringCircumference = 2 * Math.PI * ringRadius
    const ringOffset = ringCircumference * (1 - progress)

    return (
        <div className="intervention" role="dialog" aria-modal="true">
            <div
                className={`stage ${phase === "breathing" ? "stage-visible" : ""}`}
            >
                <div className="breathe-wrap">
                    <div className="breathe-circle" />
                    <svg
                        className="breathe-ring"
                        viewBox="0 0 120 120"
                        role="img"
                        aria-label="Breathing exercise progress"
                    >
                        <title>Breathing exercise progress</title>
                        <circle
                            className="breathe-ring-bg"
                            cx="60"
                            cy="60"
                            r={ringRadius}
                        />
                        <circle
                            className="breathe-ring-fg"
                            cx="60"
                            cy="60"
                            r={ringRadius}
                            strokeDasharray={ringCircumference}
                            strokeDashoffset={ringOffset}
                            transform="rotate(-90 60 60)"
                        />
                    </svg>
                    <div className="count" aria-live="assertive">
                        {remaining}
                    </div>
                </div>

                <p className="breath-hint" key={String(breathIn)}>
                    {breathIn ? "Breathe in…" : "Breathe out…"}
                </p>
                <p className="breath-sub">Give your attention a moment to land.</p>
            </div>

            <div className={`stage ${phase === "tasks" ? "stage-visible" : ""}`}>
                <div className="tasks-panel">
                    <h1 className="tasks-eyebrow">Now.</h1>
                    <p className="tasks-title">What did you intend to do?</p>

                    <ul className="tasks-list">
                        {tasks.map((task) => (
                            <li key={task.id} className="task-item">
                                <button
                                    type="button"
                                    className="task-button"
                                    onClick={() => handleTask(task)}
                                >
                                    <span className="task-title">{task.title}</span>
                                    <span className="task-cta">Do this</span>
                                </button>
                            </li>
                        ))}
                    </ul>

                    <button
                        type="button"
                        className={`choose-later ${canChooseLater ? "visible" : ""}`}
                        onClick={handleChooseLater}
                        tabIndex={canChooseLater ? 0 : -1}
                    >
                        I’ll choose later
                    </button>
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Styles (kept inside the shadow root so hostile site CSS cannot interfere)
// ---------------------------------------------------------------------------

const OVERLAY_STYLE = `
:host(div) {
    all: initial;
    display: block;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: auto;
}

.intervention {
    position: fixed;
    inset: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(160deg, #0f172a 0%, #1e293b 55%, #1e3a5f 100%);
    color: #e2e8f0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
    user-select: none;
    text-align: center;
}

.stage {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    opacity: 0;
    transform: scale(0.98);
    transition: opacity 600ms ease, transform 600ms ease;
    pointer-events: none;
}

.stage-visible {
    opacity: 1;
    transform: scale(1);
}

.breathe-wrap {
    position: relative;
    display: grid;
    place-items: center;
    width: 240px;
    height: 240px;
}

.breathe-circle {
    width: 210px;
    height: 210px;
    border-radius: 50%;
    will-change: transform;
    background: radial-gradient(circle at 32% 30%, #a5f3fc 0%, #3b82f6 55%, #1e3a8a 100%);
    box-shadow: 0 0 90px rgba(59, 130, 246, 0.55);
    animation: breathe 8s ease-in-out infinite;
}

@keyframes breathe {
    0% { transform: scale(0.55); }
    50% { transform: scale(1); }
    100% { transform: scale(0.55); }
}

.breathe-ring {
    position: absolute;
    width: 240px;
    height: 240px;
}

.breathe-ring-bg {
    fill: none;
    stroke: rgba(255, 255, 255, 0.18);
    stroke-width: 5;
}

.breathe-ring-fg {
    fill: none;
    stroke: #f8fafc;
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dashoffset 1s linear;
}

.count {
    position: absolute;
    font-size: 44px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #f8fafc;
    font-variant-numeric: tabular-nums;
}

.breath-hint {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: #ffffff;
}

.breath-sub {
    margin: 0;
    font-size: 15px;
    color: #94a3b8;
}

.tasks-panel {
    max-width: 560px;
    width: 90vw;
    padding: 32px;
    color: #e2e8f0;
}

.tasks-eyebrow {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #93c5fd;
}

.tasks-title {
    margin: 0 0 28px;
    font-size: 32px;
    font-weight: 600;
    line-height: 1.25;
    color: #ffffff;
}

.tasks-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.task-item {
    margin: 0;
}

.task-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    padding: 16px 20px;
    border-radius: 14px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(148, 163, 184, 0.08);
    color: #f8fafc;
    font: inherit;
    font-size: 16px;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
}

.task-button:hover {
    background: rgba(59, 130, 246, 0.22);
    border-color: #60a5fa;
    transform: translateY(-1px);
}

.task-title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.task-cta {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #93c5fd;
}

.choose-later {
    margin-top: 28px;
    border: none;
    background: none;
    color: #94a3b8;
    font: inherit;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 500ms ease, transform 500ms ease, color 150ms ease;
}

.choose-later.visible {
    opacity: 1;
    transform: translateY(0);
}

.choose-later:hover {
    color: #cbd5e1;
}
`