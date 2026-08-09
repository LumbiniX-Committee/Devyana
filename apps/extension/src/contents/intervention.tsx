import { useCallback, useEffect, useRef, useState, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { PlasmoCSConfig } from "plasmo"
import type {
    InterventionActiveMessage,
    InterventionCompletedMessage,
    InterventionMessage,
    InterventionTaskType,
    Task
} from "@vinaya/behavior-core"
import buddhaPalmVideo from "url:~/assets/buddha-palm.mp4"

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
// it cannot scroll, block every keyboard event (except typing inside the
// overlay's own form controls) at capture time, and disable pointer events for
// everything except the overlay's own shadow root.
// ---------------------------------------------------------------------------

type PageLock = {
    overflow: string;
    pointerEvents: string;
}

const DANGEROUS_KEYS = new Set(["Escape", "F1", "F5", "F11", "F12"])
const DANGEROUS_SHORTCUTS = new Set(["r", "w", "t", "n"])

function lockPage(): () => void {
    const rootEl = document.documentElement
    const prev: PageLock = {
        overflow: rootEl.style.overflow,
        pointerEvents: rootEl.style.pointerEvents
    }

    rootEl.style.overflow = "hidden"
    rootEl.style.pointerEvents = "none"

    const swallow = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null
        const editable = Boolean(
            target &&
            (target.isContentEditable ||
                target.tagName === "TEXTAREA" ||
                target.tagName === "INPUT" ||
                target.tagName === "SELECT")
        )
        const key = event.key.toLowerCase()
        const modified = event.ctrlKey || event.metaKey

        const safe =
            editable &&
            !DANGEROUS_KEYS.has(event.key) &&
            (!modified || !DANGEROUS_SHORTCUTS.has(key))

        if (safe) return
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

function sendCompleted(
    tabId: number | undefined,
    completed: boolean,
    taskType?: InterventionTaskType,
    response?: unknown
): void {
    const message: InterventionCompletedMessage = {
        type: "intervention_completed",
        tabId,
        completed,
        taskType,
        response
    }
    void chrome.runtime.sendMessage(message)
}

let mounted: { root: Root; host: HTMLDivElement } | null = null
let unlock: (() => void) | null = null

function mountIntervention(message: InterventionMessage): void {
    if (mounted) return

    const host = document.createElement("div")
    host.dataset.viyanaIntervention = "true"

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
            taskType={message.taskType}
            params={message.params}
            durationSec={message.durationSec}
            tasks={message.tasks ?? []}
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
    taskType: InterventionTaskType
    params?: Record<string, unknown>
    durationSec?: number
    tasks: Array<Task>
    tabId?: number
}

type Phase = "video" | "task" | "tasks"

interface TaskComponentProps {
    params?: Record<string, unknown>
    durationSec?: number
    onComplete: (response?: unknown) => void
}

const CHOOSE_LATER_DELAY_MS = 10_000

function InterventionOverlay({
    taskType,
    params,
    durationSec,
    tasks,
    tabId
}: InterventionOverlayProps) {
    const [phase, setPhase] = useState<Phase>("video")
    const [taskResult, setTaskResult] = useState<{
        taskType: InterventionTaskType
        response?: unknown
    } | null>(null)
    const [canChooseLater, setCanChooseLater] = useState(false)

    useEffect(() => {
        if (phase !== "tasks") return
        const delayed = window.setTimeout(() => {
            setCanChooseLater(true)
        }, CHOOSE_LATER_DELAY_MS)
        return () => window.clearTimeout(delayed)
    }, [phase])

    const handleVideoEnded = () => setPhase("task")

    const handleVideoError = () => {
        window.setTimeout(() => setPhase("task"), 800)
    }

    const handleTaskComplete = (response?: unknown) => {
        setTaskResult({ taskType, response })
        setPhase("tasks")
    }

    const handleTask = (task: Task) => {
        sendCompleted(tabId, true, taskResult?.taskType, taskResult?.response)
        unmountIntervention()
        if (task.url) {
            window.location.href = task.url
        } else {
            window.open(DASHBOARD_URL, "_blank")
        }
    }

    const handleChooseLater = () => {
        sendCompleted(tabId, false, taskResult?.taskType, taskResult?.response)
        unmountIntervention()
    }

    return (
        <div className="intervention" role="dialog" aria-modal="true">
            {phase === "video" && (
                <div className="stage stage-visible video-stage">
                    <VideoBuddhaPalm onEnded={handleVideoEnded} onError={handleVideoError} />
                </div>
            )}

            {phase === "task" && (
                <div className="stage stage-visible">
                    <TaskPhase
                        taskType={taskType}
                        params={params}
                        durationSec={durationSec}
                        onComplete={handleTaskComplete}
                    />
                </div>
            )}

            {phase === "tasks" && (
                <div className="stage stage-visible">
                    <TaskSuggestions
                        tasks={tasks}
                        canChooseLater={canChooseLater}
                        onTask={handleTask}
                        onChooseLater={handleChooseLater}
                    />
                </div>
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Phase 0: Buddha's Palm video playback
// ---------------------------------------------------------------------------

function VideoBuddhaPalm({ onEnded, onError }: { onEnded: () => void; onError: () => void }) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [needsGesture, setNeedsGesture] = useState(false)

    useEffect(() => {
        videoRef.current?.play().catch(() => setNeedsGesture(true))
    }, [])

    const handleClick = () => {
        const video = videoRef.current
        if (!video) return
        video.play()
            .then(() => setNeedsGesture(false))
            .catch(() => { })
    }

    return (
        <button
            type="button"
            className="buddha-video"
            onClick={handleClick}
            aria-label="Begin the Buddha's Palm intervention"
        >
            <video
                ref={videoRef}
                className="buddha-video-player"
                src={buddhaPalmVideo}
                autoPlay
                muted
                playsInline
                onEnded={onEnded}
                onError={onError}
            />
            {needsGesture && <span className="gesture-label">Tap to begin</span>}
        </button>
    )
}

// ---------------------------------------------------------------------------
// Phase 1: type-driven actionable tasks
// ---------------------------------------------------------------------------

function TaskPhase({
    taskType,
    params,
    durationSec,
    onComplete
}: {
    taskType: InterventionTaskType
    params?: Record<string, unknown>
    durationSec?: number
    onComplete: (response?: unknown) => void
}) {
    const TaskComponent = TASK_COMPONENTS[taskType] ?? CustomTask
    return <TaskComponent params={params} durationSec={durationSec} onComplete={onComplete} />
}

const DEFAULT_REALIZATION_QUESTION =
    "What were you about to do before this moment interrupted you?"

function RealizationTask({ params, onComplete }: TaskComponentProps) {
    const question =
        typeof params?.question === "string" && params.question.trim().length > 0
            ? params.question
            : DEFAULT_REALIZATION_QUESTION
    const minChars = typeof params?.minChars === "number" ? params.minChars : 20
    const [text, setText] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const length = text.trim().length
    const canSubmit = length >= minChars

    useEffect(() => {
        textareaRef.current?.focus()
    }, [])

    const submit = () => onComplete({ response: text.trim() })

    return (
        <div className="task-panel">
            <h1 className="tasks-eyebrow">Reflect</h1>
            <p className="tasks-title">{question}</p>
            <textarea
                ref={textareaRef}
                className="realization-textarea"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Write whatever comes to mind…"
                rows={6}
            />
            <p className="char-hint" aria-live="polite">
                {length}/{minChars} characters
            </p>
            <button
                type="button"
                className="task-primary-button"
                disabled={!canSubmit}
                onClick={() => submit()}
            >
                Submit
            </button>
        </div>
    )
}

function BreathingTask({ params, durationSec, onComplete }: TaskComponentProps) {
    const totalSec = Math.max(
        1,
        typeof params?.durationSec === "number" ? params.durationSec : durationSec ?? 30
    )
    const [remaining, setRemaining] = useState(totalSec)
    const [breathIn, setBreathIn] = useState(true)

    useEffect(() => {
        const timer = window.setInterval(() => {
            setRemaining((prev) => {
                if (prev <= 1) {
                    onComplete({})
                    return 0
                }
                return prev - 1
            })
        }, 1_000)
        return () => window.clearInterval(timer)
    }, [onComplete])

    useEffect(() => {
        const breath = window.setInterval(() => {
            setBreathIn((value) => !value)
        }, 4_000)
        return () => window.clearInterval(breath)
    }, [])

    const progress = totalSec <= 0 ? 0 : remaining / totalSec
    const ringRadius = 54
    const ringCircumference = 2 * Math.PI * ringRadius
    const ringOffset = ringCircumference * (1 - progress)

    return (
        <>
            <div className="breathe-wrap">
                <div className="breathe-circle" />
                <svg
                    className="breathe-ring"
                    viewBox="0 0 120 120"
                    role="img"
                    aria-label="Breathing exercise progress"
                >
                    <title>Breathing exercise progress</title>
                    <circle className="breathe-ring-bg" cx="60" cy="60" r={ringRadius} />
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
        </>
    )
}

const DEFAULT_DIVINE_PROMPTS = [
    "Place your hand on your heart.",
    "Take one slow, deep breath.",
    "Think of one thing you are grateful for.",
    "Let go of anything you cannot control.",
    "Return to the task that matters most."
]

function DivineFollowupsTask({ params, onComplete }: TaskComponentProps) {
    const prompts =
        Array.isArray(params?.prompts) && params.prompts.length > 0
            ? (params.prompts as Array<string>)
            : DEFAULT_DIVINE_PROMPTS
    const stepSec = typeof params?.stepDurationSec === "number" ? params.stepDurationSec : 8
    const [index, setIndex] = useState(0)
    const [remaining, setRemaining] = useState(stepSec)
    const isLast = index >= prompts.length - 1

    const advance = useCallback(() => {
        if (index >= prompts.length - 1) {
            onComplete({})
        } else {
            setIndex((i) => i + 1)
            setRemaining(stepSec)
        }
    }, [index, prompts.length, stepSec, onComplete])

    useEffect(() => {
        const timer = window.setInterval(() => {
            setRemaining((prev) => {
                if (prev <= 1) {
                    advance()
                    return stepSec
                }
                return prev - 1
            })
        }, 1_000)
        return () => window.clearInterval(timer)
    }, [advance, stepSec])

    return (
        <div className="task-panel">
            <h1 className="tasks-eyebrow">
                {isLast ? "One last thing" : `Prompt ${index + 1} of ${prompts.length}`}
            </h1>
            <p className="tasks-title" key={index}>
                {prompts[index]}
            </p>
            <p className="char-hint" aria-live="polite">
                {remaining}s
            </p>
            <button type="button" className="task-primary-button" onClick={() => advance()}>
                {isLast ? "Finish" : "Next"}
            </button>
        </div>
    )
}

function CustomTask({ params, onComplete }: TaskComponentProps) {
    const title = typeof params?.title === "string" && params.title.length > 0 ? params.title : "Pause"
    const body =
        typeof params?.body === "string" && params.body.length > 0
            ? params.body
            : "Take a moment to ground yourself before you continue."
    const confirmLabel =
        typeof params?.confirmLabel === "string" && params.confirmLabel.length > 0
            ? params.confirmLabel
            : "I'm ready"

    return (
        <div className="task-panel">
            <p className="tasks-title">{title}</p>
            <p className="task-body">{body}</p>
            <button type="button" className="task-primary-button" onClick={() => onComplete({})}>
                {confirmLabel}
            </button>
        </div>
    )
}

function UpcomingTask({ onComplete }: TaskComponentProps) {
    return (
        <div className="task-panel">
            <p className="tasks-title">Coming Soon</p>
            <p className="task-body">This intervention type is not yet implemented.</p>
            <button type="button" className="task-primary-button" onClick={() => onComplete({})}>
                Continue
            </button>
        </div>
    )
}

const TASK_COMPONENTS: Record<InterventionTaskType, ComponentType<TaskComponentProps>> = {
    realization: RealizationTask,
    inhale_exhale: BreathingTask,
    divine_followups: DivineFollowupsTask,
    custom: CustomTask,
    quiz: UpcomingTask,
    story: UpcomingTask,
    challenge: UpcomingTask
}

// ---------------------------------------------------------------------------
// Task suggestion overlay (post-task)
// ---------------------------------------------------------------------------

function TaskSuggestions({
    tasks,
    canChooseLater,
    onTask,
    onChooseLater
}: {
    tasks: Array<Task>
    canChooseLater: boolean
    onTask: (task: Task) => void
    onChooseLater: () => void
}) {
    return (
        <div className="tasks-panel">
            <h1 className="tasks-eyebrow">Now.</h1>
            <p className="tasks-title">What did you intend to do?</p>

            <ul className="tasks-list">
                {tasks.map((task) => (
                    <li key={task.id} className="task-item">
                        <button type="button" className="task-button" onClick={() => onTask(task)}>
                            <span className="task-title">{task.title}</span>
                            <span className="task-cta">Do this</span>
                        </button>
                    </li>
                ))}
            </ul>

            <button
                type="button"
                className={`choose-later ${canChooseLater ? "visible" : ""}`}
                onClick={onChooseLater}
                tabIndex={canChooseLater ? 0 : -1}
            >
                I’ll choose later
            </button>
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
    pointer-events: auto;
}

.buddha-video {
    position: absolute;
    inset: 0;
    background: #000;
    border: none;
    padding: 0;
    margin: 0;
    -webkit-appearance: none;
    display: block;
}

.buddha-video-player {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.gesture-label {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 16px 28px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: #ffffff;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 1px;
    backdrop-filter: blur(6px);
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

.tasks-panel,
.task-panel {
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
    line-height: 1.3;
    color: #ffffff;
}

.task-body {
    margin: 0 0 28px;
    font-size: 17px;
    line-height: 1.6;
    color: #cbd5e1;
}

.realization-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.7);
    color: #f8fafc;
    font: inherit;
    font-size: 16px;
    line-height: 1.5;
    resize: none;
}

.realization-textarea:focus {
    outline: none;
    border-color: #60a5fa;
}

.char-hint {
    margin: 0;
    font-variant-numeric: tabular-nums;
    font-size: 14px;
    color: #94a3b8;
}

.task-primary-button,
.task-control-next {
    margin-top: 8px;
    border: none;
    border-radius: 999px;
    padding: 14px 34px;
    background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
    color: #ffffff;
    font: inherit;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: transform 150ms ease, opacity 150ms ease, box-shadow 150ms ease;
    box-shadow: 0 8px 30px rgba(37, 99, 235, 0.45);
}

.task-primary-button:hover:not(:disabled),
.task-control-next:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 36px rgba(37, 99, 235, 0.55);
}

.task-primary-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
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