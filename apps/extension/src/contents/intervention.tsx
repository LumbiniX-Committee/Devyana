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
import inhaleExhaleVideo from "url:~/assets/inhale-exhale.mp4"
import { ZenYouTubePlayer } from "./ZenYouTubePlayer"

export const config: PlasmoCSConfig = {
    matches: ["<all_urls>"],
    run_at: "document_idle"
}

const DASHBOARD_URL = chrome.runtime.getURL("tabs/setup.html")

// Only the top frame should host the intervention overlay; iframes would just
// duplicate it and fight over the viewport.
if (window.top === window) {
    chrome.runtime.onMessage.addListener((message: InterventionMessage, _sender, sendResponse) => {
        if (message?.type !== "show_intervention") return
        sendResponse({ vinayaInterventionReady: mountIntervention(message) })
        return false
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
        // Events originating anywhere inside the overlay's shadow root must
        // flow through untouched: a keydown target inside a shadow DOM can be
        // retargeted (or focus can briefly sit on the shadow host itself), so
        // the tagName check below is not a reliable guard for typing inside the
        // Reflect box. Checking the composed path is.
        const overlayHost = document.querySelector("[data-vinaya-intervention='true']")
        const inOverlay = Boolean(
            overlayHost &&
            typeof event.composedPath === "function" &&
            event.composedPath().includes(overlayHost)
        )
        const target = event.target as HTMLElement | null
        const editable =
            inOverlay ||
            Boolean(
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

function mountIntervention(message: InterventionMessage): boolean {
    // Programmatic injection is used as a fallback for tabs that predate an
    // extension reload. Avoid a second shadow root if an earlier script copy
    // already mounted the intervention.
    if (mounted || document.querySelector("[data-vinaya-intervention='true']")) return true

    const host = document.createElement("div")
    host.dataset.vinayaIntervention = "true"

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

    return true
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

        // Every intervention, including a fulfilled challenge, routes through
        // the task suggestion panel so the user can pick up where they left
        // off. "I'll choose later" (revealed after CHOOSE_LATER_DELAY_MS) is
        // always there as an escape hatch to simply dismiss the overlay.
        setPhase("tasks")
    }

    const handleTask = (task: Task) => {
        unmountIntervention()
        sendCompleted(tabId, true, taskResult?.taskType, taskResult?.response)
        if (task.url) {
            window.open(task.url, "_blank", "noopener")
        } else {
            window.open(DASHBOARD_URL, "_blank")
        }
    }

    const handleChooseLater = () => {
        unmountIntervention()
        sendCompleted(tabId, false, taskResult?.taskType, taskResult?.response)
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
                onPointerDown={() => textareaRef.current?.focus()}
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
    const [breathPhase, setBreathPhase] = useState<"in" | "hold" | "out">("in")

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
        const phases: ReadonlyArray<{ phase: "in" | "hold" | "out"; ms: number }> = [
            { phase: "in", ms: 4_000 },
            { phase: "hold", ms: 2_000 },
            { phase: "out", ms: 4_000 }
        ]
        let index = 0
        let timeout: number
        const schedule = () => {
            timeout = window.setTimeout(() => {
                index = (index + 1) % phases.length
                setBreathPhase(phases[index].phase)
                schedule()
            }, phases[index].ms)
        }
        schedule()
        return () => window.clearTimeout(timeout)
    }, [])

    const progress = totalSec <= 0 ? 0 : remaining / totalSec
    const ringRadius = 54
    const ringCircumference = 2 * Math.PI * ringRadius
    const ringOffset = ringCircumference * (1 - progress)

    return (
        <>
            <div className="breathe-wrap">
                <div className="breathe-circle">
                    <video
                        className="breathe-video"
                        src={inhaleExhaleVideo}
                        muted
                        playsInline
                        aria-hidden="true"
                        onLoadedMetadata={(event) => {
                            const video = event.currentTarget
                            video.currentTime = 0.1
                            video.pause()
                        }}
                    />
                </div>
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
            </div>
            <p className="breath-hint" key={breathPhase}>
                {breathPhase === "in"
                    ? "Breathe in…"
                    : breathPhase === "hold"
                      ? "Hold"
                      : "Breathe out…"}
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

// ---------------------------------------------------------------------------
// Quiz — multiple-choice mindfulness check
// ---------------------------------------------------------------------------

type QuizQuestion = {
    prompt: string
    options: string[]
    customPlaceholder?: string
}

const DEFAULT_QUIZ_TITLE = "Mindful Check-In"

const DEFAULT_QUIZ_QUESTIONS: QuizQuestion[] = [
    {
        prompt: "What distracted your mind the most today?",
        options: [
            "The endless scroll (social media)",
            "The illusion of urgency (overworking)",
            "Dwelling on the past (regret)"
        ],
        customPlaceholder: "Another path..."
    },
    {
        prompt: "What are you quietly grateful for in this moment?",
        options: [
            "The breath that carries me",
            "The presence of loved ones",
            "The stillness between thoughts"
        ],
        customPlaceholder: "A silent gratitude..."
    },
    {
        prompt: "What intention will you carry into tomorrow?",
        options: [
            "To listen more than I speak",
            "To act with compassion",
            "To release what no longer serves me"
        ],
        customPlaceholder: "My own intention..."
    }
]

function parseQuizQuestions(value: unknown): QuizQuestion[] | null {
    if (!Array.isArray(value)) return null
    const parsed: QuizQuestion[] = []
    for (const item of value) {
        if (!item || typeof item !== "object") return null
        const record = item as Record<string, unknown>
        const prompt = typeof record.prompt === "string" && record.prompt.trim()
            ? record.prompt.trim()
            : ""
        const rawOptions = Array.isArray(record.options) ? record.options : []
        const options = rawOptions.filter(
            (option): option is string => typeof option === "string" && Boolean(option.trim())
        )
        if (!prompt || options.length < 2) return null
        parsed.push({
            prompt,
            options,
            customPlaceholder:
                typeof record.customPlaceholder === "string" && record.customPlaceholder.trim()
                    ? record.customPlaceholder
                    : "My own response..."
        })
    }
    return parsed.length ? parsed : null
}

function QuizTask({ params, onComplete }: TaskComponentProps) {
    const quizParams =
        params?.quiz && typeof params.quiz === "object"
            ? params.quiz as Record<string, unknown>
            : {}
    const questions = parseQuizQuestions(quizParams.questions)

    if (questions) {
        const title = typeof quizParams.title === "string" && quizParams.title.trim()
            ? quizParams.title
            : DEFAULT_QUIZ_TITLE
        return (
            <MultiQuestionQuiz
                title={title}
                questions={questions}
                onComplete={onComplete}
            />
        )
    }

    const question =
        typeof params?.question === "string" && params.question.trim()
            ? params.question
            : typeof quizParams.question === "string" && quizParams.question.trim()
                ? quizParams.question
                : null

    if (question) {
        return (
            <SingleQuestionQuiz
                question={question}
                fallbackOptions={DEFAULT_QUIZ_QUESTIONS[0].options}
                options={Array.isArray(params?.options)
                    ? params.options
                    : Array.isArray(quizParams.options)
                        ? quizParams.options
                        : undefined}
                onComplete={onComplete}
            />
        )
    }

    return (
        <MultiQuestionQuiz
            title={DEFAULT_QUIZ_TITLE}
            questions={DEFAULT_QUIZ_QUESTIONS}
            onComplete={onComplete}
        />
    )
}

function SingleQuestionQuiz({
    question,
    options,
    fallbackOptions,
    onComplete
}: {
    question: string
    options?: unknown
    fallbackOptions: string[]
    onComplete: (response?: unknown) => void
}) {
    const rawOptions = Array.isArray(options) ? options : []
    const cleaned = rawOptions.filter(
        (option): option is string => typeof option === "string" && Boolean(option.trim())
    )
    const safeOptions = cleaned.length >= 2 ? cleaned : fallbackOptions
    const [selected, setSelected] = useState<string | null>(null)

    const submit = () => {
        onComplete({ response: selected })
    }

    return (
        <div className="task-panel">
            <h1 className="tasks-eyebrow">Quick Check</h1>
            <p className="tasks-title">{question}</p>
            <div className="quiz-options">
                {safeOptions.map((option, index) => (
                    <button
                        key={`${option}-${index}`}
                        type="button"
                        className={`quiz-option ${selected === option ? "selected" : ""}`}
                        onClick={() => setSelected(option)}
                    >
                        {option}
                    </button>
                ))}
            </div>
            <button
                type="button"
                className="task-primary-button"
                disabled={!selected}
                onClick={submit}
            >
                Submit
            </button>
        </div>
    )
}

function MultiQuestionQuiz({
    title,
    questions,
    onComplete
}: {
    title: string
    questions: QuizQuestion[]
    onComplete: (response?: unknown) => void
}) {
    const [index, setIndex] = useState(0)
    const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""))
    const [customValues, setCustomValues] = useState<string[]>(() => questions.map(() => ""))
    const [done, setDone] = useState(false)
    const question = questions[index]
    const answer = answers[index]
    const customValue = customValues[index]
    const isLast = index === questions.length - 1
    const canContinue = Boolean(answer.trim() || customValue.trim())

    const selectOption = (option: string) => {
        setAnswers((current) => current.map((value, i) => (i === index ? option : value)))
        setCustomValues((current) => current.map((value, i) => (i === index ? "" : value)))
    }

    const changeCustom = (value: string) => {
        setCustomValues((current) => current.map((item, i) => (i === index ? value : item)))
        setAnswers((current) => current.map((item, i) => (i === index ? value : item)))
    }

    const next = () => {
        if (!canContinue) return
        if (isLast) {
            setDone(true)
        } else {
            setIndex((current) => current + 1)
        }
    }

    if (done) {
        return (
            <div className="task-panel">
                <h1 className="tasks-eyebrow">Reflection complete</h1>
                <p className="tasks-title">One response to carry forward</p>
                <p className="task-body">Thank you for meeting this teaching with attention. The page will appear in a moment.</p>
                <button
                    type="button"
                    className="task-primary-button"
                    onClick={() => onComplete({ responses: answers, title })}
                >
                    Continue
                </button>
            </div>
        )
    }

    return (
        <div className="task-panel">
            <div className="quiz-header">
                <h1 className="tasks-eyebrow quiz-eyebrow">{title}</h1>
                <span className="quiz-step-count">{index + 1} / {questions.length}</span>
            </div>
            <div className="quiz-steps" aria-hidden="true">
                {questions.map((_, stepIndex) => (
                    <i key={`quiz-step-${stepIndex}`} className={`quiz-step-dot ${stepIndex <= index ? "active" : ""}`} />
                ))}
            </div>
            <p className="tasks-title quiz-prompt">{question.prompt}</p>
            <div className="quiz-options">
                {question.options.map((option, optionIndex) => {
                    const selected = answer === option && !customValue.trim()
                    return (
                        <button
                            key={`${option}-${optionIndex}`}
                            type="button"
                            className={`quiz-option ${selected ? "selected" : ""}`}
                            onClick={() => selectOption(option)}
                        >
                            {option}
                        </button>
                    )
                })}
                <input
                    type="text"
                    value={customValue}
                    onChange={(event) => changeCustom(event.target.value)}
                    onFocus={() => {
                        if (!customValue.trim()) {
                            setAnswers((current) => current.map((item, i) => (i === index ? "" : item)))
                        }
                    }}
                    placeholder={question.customPlaceholder}
                    className="quiz-custom-input"
                    aria-label={question.customPlaceholder}
                />
            </div>
            <div className="quiz-nav-row">
                <button
                    type="button"
                    className="quiz-back-button"
                    onClick={() => setIndex((current) => Math.max(0, current - 1))}
                    disabled={index === 0}
                >
                    Back
                </button>
                <button
                    type="button"
                    className="task-primary-button quiz-next-button"
                    disabled={!canContinue}
                    onClick={next}
                >
                    {isLast ? "Complete reflection" : "Next question"}
                </button>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Story — short guided narrative with a lesson
// ---------------------------------------------------------------------------

const DEFAULT_STORY = {
    title: "A River Is Still a River",
    videoUrl: "https://www.youtube.com/watch?v=GicJjS3wXGY&list=PLVuzoIVk88hhJTjHs3yrmTjf7oBouYAg_",
    videoTitle: "A River Is Still a River | Pabbatupatthara Jataka",
    paragraphs: [
        "A river may bend around stones, narrow between cliffs, or widen into a quiet valley. Yet it remains a river.",
        "In the same way, difficult moments can change the shape of a day without defining the whole of it.",
        "The story asks us to meet each turn with patience instead of rushing to make it disappear.",
        "Pause now and notice one thing that is changing. What steady quality can you bring to it?"
    ]
}

function StoryTask({ params, onComplete }: TaskComponentProps) {
    const customParagraphs = Array.isArray(params?.paragraphs)
        ? params.paragraphs.filter(
            (paragraph): paragraph is string => typeof paragraph === "string" && Boolean(paragraph.trim())
        )
        : []
    const paragraphs = customParagraphs.length ? customParagraphs : DEFAULT_STORY.paragraphs
    const title = typeof params?.title === "string" && params.title.trim()
        ? params.title
        : DEFAULT_STORY.title
    const videoUrl = typeof params?.videoUrl === "string" && params.videoUrl.trim()
        ? params.videoUrl
        : DEFAULT_STORY.videoUrl
    const videoTitle = typeof params?.videoTitle === "string" && params.videoTitle.trim()
        ? params.videoTitle
        : title === DEFAULT_STORY.title ? DEFAULT_STORY.videoTitle : title
    const stepSec = Math.max(
        1,
        typeof params?.stepDurationSec === "number" ? params.stepDurationSec : 6
    )
    const [index, setIndex] = useState(0)
    const [remaining, setRemaining] = useState(stepSec)
    const isLast = index >= paragraphs.length - 1
    const [showFull, setShowFull] = useState(false)
    const [showVideo, setShowVideo] = useState(true)

    const advance = useCallback(() => {
        if (index >= paragraphs.length - 1) {
            setShowFull(true)
        } else {
            setIndex((i) => i + 1)
            setRemaining(stepSec)
        }
    }, [index, paragraphs.length, stepSec])

    useEffect(() => {
        if (showFull || showVideo) return
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
    }, [advance, stepSec, showFull, showVideo])

    if (showVideo) {
        return (
            <div className="task-panel story-video-panel">
                <h1 className="tasks-eyebrow">Story</h1>
                <p className="tasks-title">{title}</p>
                <ZenYouTubePlayer videoUrl={videoUrl} title={videoTitle} />
                <button type="button" className="task-primary-button" onClick={() => setShowVideo(false)}>
                    Continue the story
                </button>
            </div>
        )
    }

    if (showFull) {
        return (
            <div className="task-panel">
                <h1 className="tasks-eyebrow">Reflection</h1>
                {paragraphs.map((p, i) => (
                    <p key={i} className="story-paragraph">{p}</p>
                ))}
                <button type="button" className="task-primary-button" onClick={() => onComplete({})}>
                    I understand
                </button>
            </div>
        )
    }

    return (
        <div className="task-panel">
            <h1 className="tasks-eyebrow">
                A story{isLast ? " (final)" : ` ${index + 1} of ${paragraphs.length}`}
            </h1>
            <p className="story-paragraph" key={index}>
                {paragraphs[index]}
            </p>
            <p className="char-hint">{remaining}s</p>
            <button type="button" className="task-primary-button" onClick={() => advance()}>
                {isLast ? "Finish" : "Next"}
            </button>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Challenge — commit to a mindful action
// ---------------------------------------------------------------------------

type Challenge = {
    id: string;
    title: string;
    description: string;
}

/**
 * How long to wait by default (seconds) for the user to complete a challenge
 * when the challenge text carries no explicit duration ("Drink water" vs.
 * "Walk for 20 seconds"). When the countdown elapses the website is shown.
 */
const CHALLENGE_DEFAULT_SECS = 10

/** Hard ceiling so a runaway number in AI text cannot pin the user forever. */
const MAX_CHALLENGE_SECS = 3_600

/**
 * Fallback challenges used whenever the AI-supplied list is missing, empty or
 * malformed, so a challenge intervention can never dead-end on an error.
 * These are deliberately tiny, physical, do-it-now commitments.
 */
const DEFAULT_CHALLENGES: Array<Challenge> = [
    {
        id: "drink-water",
        title: "Drink a glass of water",
        description: "Step away and drink a full glass of water. A small act of care for your body."
    },
    {
        id: "walk-20s",
        title: "Walk for 20 seconds",
        description: "Stand up and walk for twenty seconds to reset your body and mind."
    },
    {
        id: "five-deep-breaths",
        title: "Take five deep breaths",
        description: "Close your eyes and take five slow, deep breaths before you continue."
    },
    {
        id: "look-out-window",
        title: "Look out the window",
        description: "Rest your eyes on the distance for a moment and notice what is out there."
    },
    {
        id: "shoulder-stretch",
        title: "Stretch your shoulders",
        description: "Roll your shoulders and soften your neck with a few gentle movements."
    },
    {
        id: "gratitude-note",
        title: "Write a gratitude note",
        description: "Jot down one thing you are thankful for right now."
    }
]

const DEFAULT_CHALLENGE_DESC = "Choose this challenge and return to what matters."

/**
 * Normalises challenge input coming from the AI / desktop into a safe list of
 * Challenge items. Accepts full objects, bare strings, a mix of both, or
 * nothing at all — anything unusable is dropped so the UI can fall back to
 * {@link DEFAULT_CHALLENGES} instead of crashing.
 */
function parseChallenges(raw: unknown): Array<Challenge> {
    if (!Array.isArray(raw)) return []

    const parsed: Array<Challenge> = []

    for (let index = 0; index < raw.length; index += 1) {
        const candidate = raw[index]

        if (typeof candidate === "string") {
            const title = candidate.trim()
            if (title) {
                parsed.push({ id: `challenge-${index}`, title, description: DEFAULT_CHALLENGE_DESC })
            }
            continue
        }

        if (!candidate || typeof candidate !== "object") continue

        const record = candidate as Record<string, unknown>
        const title = typeof record.title === "string" ? record.title.trim() : ""

        if (!title) continue

        parsed.push({
            id: typeof record.id === "string" && record.id.trim() ? record.id : `challenge-${index}`,
            title,
            description:
                typeof record.description === "string" && record.description.trim()
                    ? record.description
                    : DEFAULT_CHALLENGE_DESC
        })
    }

    return parsed
}

/**
 * Reads the intended completion time out of the challenge copy — "Walk for
 * 20 seconds" -> 20s, "Meditate for 5 minutes" -> 300s, "1 hour" -> 3600s.
 * Numbers are matched first (largest unit first) so "2 hours" never reads as
 * 2 minutes. Returns null when no number + unit is present so callers can
 * fall back to {@link CHALLENGE_DEFAULT_SECS}.
 */
function extractChallengeSeconds(text: string): number | null {
    const patterns: Array<{ pattern: RegExp; factor: number }> = [
        { pattern: /(\d+)\s*(?:hours?|hrs?|h)\b/i, factor: 3_600 },
        { pattern: /(\d+)\s*(?:minutes?|mins?|m)\b/i, factor: 60 },
        { pattern: /(\d+)\s*(?:seconds?|secs?|s)\b/i, factor: 1 }
    ]

    for (const { pattern, factor } of patterns) {
        const match = pattern.exec(text)
        if (match) {
            const value = Number.parseInt(match[1], 10)
            if (Number.isFinite(value) && value > 0) {
                return Math.min(value * factor, MAX_CHALLENGE_SECS)
            }
        }
    }

    return null
}

function formatChallengeCountdown(seconds: number): string {
    const rounded = Math.max(0, Math.ceil(seconds))
    const minutes = Math.floor(rounded / 60)
    const secs = rounded % 60
    if (minutes > 0) return `${minutes}m ${secs}s`
    return `${rounded}s`
}

function ChallengeLotus() {
    return (
        <svg
            className="challenge-lotus"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M12 22s-3-4-3-7a3 3 0 0 1 6 0c0 3-3 7-3 7Z" />
            <path d="M12 22s3-4 3-7c0-2-2-3-3-3" />
            <path d="M12 22s-3-4-3-7c0-2 2-3 3-3" />
            <path d="M17.5 14.5a6 6 0 0 0-11 0" />
        </svg>
    )
}

function ChallengeTask({ params, onComplete }: TaskComponentProps) {
    const challenges = parseChallenges(params?.challenges)
    const safeChallenges = challenges.length ? challenges : DEFAULT_CHALLENGES
    const [picked, setPicked] = useState<Challenge | null>(null)
    const [countdown, setCountdown] = useState<{ total: number; remaining: number } | null>(null)

    // Keep the latest callback in a ref so the countdown effect can depend
    // only on `picked` and never restart on a parent re-render.
    const onCompleteRef = useRef(onComplete)
    onCompleteRef.current = onComplete

    useEffect(() => {
        if (!picked) {
            setCountdown(null)
            return
        }

        const total =
            extractChallengeSeconds(`${picked.title} ${picked.description}`) ?? CHALLENGE_DEFAULT_SECS
        setCountdown({ total, remaining: total })

        const startedAt = Date.now()
        const timer = window.setInterval(() => {
            const remaining = Math.max(0, total - Math.floor((Date.now() - startedAt) / 1_000))
            setCountdown({ total, remaining })

            // Time's up: the user has had their window to complete the task,
            // so fulfil the challenge and let the overlay reveal the website.
            if (remaining <= 0) {
                window.clearInterval(timer)
                onCompleteRef.current({ challenge: picked.id, completed: true })
            }
        }, 250)

        return () => window.clearInterval(timer)
    }, [picked])

    if (picked) {
        const progress = countdown ? (countdown.remaining / countdown.total) * 100 : 100
        return (
            <div className="challenge-panel">
                <div className="challenge-head">
                    <ChallengeLotus />
                    <div className="challenge-rule" />
                    <p className="challenge-eyebrow">Mindful Act</p>
                </div>
                <h2 className="challenge-quote">&ldquo;{picked.title}&rdquo;</h2>
                <p className="challenge-desc">{picked.description}</p>
                <div className="challenge-timer" aria-live="polite">
                    <span className="challenge-timer-label">Time to complete</span>
                    <span className="challenge-timer-value">
                        {countdown ? formatChallengeCountdown(countdown.remaining) : "—"}
                    </span>
                </div>
                <div className="challenge-progress">
                    <div className="challenge-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="challenge-actions">
                    <button
                        type="button"
                        className="challenge-awaken"
                        onClick={() => onComplete({ challenge: picked.id, completed: true })}
                    >
                        <span className="challenge-awaken-label">I'm done</span>
                    </button>
                    <button
                        type="button"
                        className="challenge-skip"
                        onClick={() => onComplete({ challenge: picked.id, completed: false })}
                    >
                        Maybe later
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="challenge-panel">
            <div className="challenge-head">
                <ChallengeLotus />
                <div className="challenge-rule" />
                <p className="challenge-eyebrow">Mindful Act</p>
            </div>
            <h2 className="challenge-title">Choose a small commitment</h2>
            <div className="challenge-list">
                {safeChallenges.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        className="challenge-card"
                        onClick={() => setPicked(c)}
                    >
                        <span className="challenge-card-title">{c.title}</span>
                        <span className="challenge-card-desc">{c.description}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

const TASK_COMPONENTS: Record<InterventionTaskType, ComponentType<TaskComponentProps>> = {
    realization: RealizationTask,
    inhale_exhale: BreathingTask,
    divine_followups: DivineFollowupsTask,
    custom: CustomTask,
    quiz: QuizTask,
    story: StoryTask,
    challenge: ChallengeTask
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
@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap");
:host(div) {
    all: initial;
    display: block;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: auto;
    background: #fbf7f0;
}

.intervention {
    position: fixed;
    inset: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(160deg, #fbf7f0 0%, #f5edd9 100%);
    color: #5c4b3a;
    font-family: "Poppins", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
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
    background: #fbf7f0;
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
    background: rgba(212, 168, 83, 0.16);
    border: 1px solid rgba(212, 168, 83, 0.45);
    color: #8a6d1f;
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
    overflow: hidden;
    background: radial-gradient(circle at 32% 30%, #f3e6c2 0%, #d4a853 55%, #a87a1f 100%);
    box-shadow: 0 0 90px rgba(212, 168, 83, 0.55);
}

.breathe-video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
}

.breathe-ring {
    position: absolute;
    width: 240px;
    height: 240px;
}

.breathe-ring-bg {
    fill: none;
    stroke: rgba(212, 168, 83, 0.35);
    stroke-width: 5;
}

.breathe-ring-fg {
    fill: none;
    stroke: #d4a853;
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dashoffset 1s linear;
}

.breath-hint {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: #3e2a24;
}

.breath-sub {
    margin: 0;
    font-size: 15px;
    color: #85705b;
}

.tasks-panel,
.task-panel {
    max-width: 560px;
    width: 90vw;
    padding: 32px;
    color: #5c4b3a;
    background: #fdf8f2;
    border: 1px solid #e0d7c6;
    border-radius: 16px;
    box-shadow: 0 20px 50px -28px rgba(92, 75, 58, 0.35), 0 1px 2px rgba(212, 168, 83, 0.2);
}

.tasks-eyebrow {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #c79a2e;
}

.tasks-title {
    margin: 0 0 28px;
    font-size: 32px;
    font-weight: 600;
    line-height: 1.3;
    color: #3e2a24;
}

.task-body {
    margin: 0 0 28px;
    font-size: 17px;
    line-height: 1.6;
    color: #85705b;
}

.realization-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid #d8ccb4;
    background: #ffffff;
    color: #5c4b3a;
    font: inherit;
    font-size: 16px;
    line-height: 1.5;
    resize: none;
    pointer-events: auto;
}

.realization-textarea:focus {
    outline: none;
    border-color: #d4a853;
}

.char-hint {
    margin: 0;
    font-variant-numeric: tabular-nums;
    font-size: 14px;
    color: #a4937d;
}

.task-primary-button,
.task-control-next {
    margin-top: 8px;
    border: none;
    border-radius: 999px;
    padding: 14px 34px;
    background: linear-gradient(135deg, #d4a853 0%, #c79a2e 100%);
    color: #ffffff;
    font: inherit;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: transform 150ms ease, opacity 150ms ease, box-shadow 150ms ease;
    box-shadow: 0 8px 30px rgba(212, 168, 83, 0.45);
}

.task-primary-button:hover:not(:disabled),
.task-control-next:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 36px rgba(212, 168, 83, 0.55);
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
    border: 1px solid #d8ccb4;
    background: #f8f3e9;
    color: #3e2a24;
    font: inherit;
    font-size: 16px;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
}

.task-button:hover {
    background: rgba(212, 168, 83, 0.18);
    border-color: #d4a853;
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
    color: #c79a2e;
}

.choose-later {
    margin-top: 28px;
    border: none;
    background: none;
    color: #a4937d;
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
    color: #85705b;
}

.quiz-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    margin-bottom: 12px;
}

.quiz-option {
    width: 100%;
    padding: 16px 20px;
    border-radius: 14px;
    border: 1px solid #d8ccb4;
    background: #f8f3e9;
    color: #3e2a24;
    font: inherit;
    font-size: 16px;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
    text-align: left;
}

.quiz-option:hover {
    background: rgba(212, 168, 83, 0.18);
    border-color: #d4a853;
    transform: translateY(-1px);
}

.quiz-option.selected {
    background: rgba(212, 168, 83, 0.35);
    border-color: #d4a853;
    box-shadow: 0 0 20px rgba(212, 168, 83, 0.25);
}

.quiz-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
}

.quiz-eyebrow {
    margin: 0;
}

.quiz-step-count {
    flex-shrink: 0;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: #a4937d;
}

.quiz-steps {
    display: flex;
    gap: 6px;
    margin: 0 0 24px;
}

.quiz-step-dot {
    height: 4px;
    flex: 1;
    border-radius: 999px;
    background: rgba(212, 168, 83, 0.3);
    transition: background 200ms ease;
}

.quiz-step-dot.active {
    background: #d4a853;
}

.quiz-prompt {
    font-size: 24px;
}

.quiz-custom-input {
    width: 100%;
    box-sizing: border-box;
    padding: 16px 20px;
    border-radius: 14px;
    border: 1px solid #d8ccb4;
    background: #f8f3e9;
    color: #3e2a24;
    font: inherit;
    font-size: 16px;
}

.quiz-custom-input::placeholder {
    color: #a4937d;
}

.quiz-custom-input:focus {
    outline: none;
    border-color: #d4a853;
}

.quiz-nav-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
}

.quiz-back-button {
    padding: 14px 0;
    border: 0;
    background: transparent;
    color: #a4937d;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 4px;
}

.quiz-back-button:hover {
    color: #85705b;
}

.quiz-back-button:disabled {
    cursor: default;
    opacity: 0.4;
}

.quiz-next-button {
    margin: 0;
}

.story-paragraph {
    margin: 0 0 20px;
    font-size: 20px;
    line-height: 1.7;
    color: #5c4b3a;
}

.story-paragraph:last-child {
    margin-bottom: 0;
}

.story-video-panel {
    width: min(620px, 92vw);
}

.zen-video-player {
    width: 100%;
    margin: 0 0 22px;
    padding: 12px;
    box-sizing: border-box;
    background: #faf8f5;
    box-shadow: 0 16px 34px -24px rgba(62, 42, 36, 0.6);
}

.zen-video-frame {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border: 1px solid #d4a853;
    background: #faf8f5;
}

.zen-video-iframe,
.zen-video-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.zen-video-iframe {
    border: 0;
}

.zen-video-overlay {
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    color: #3e2a24;
    background: radial-gradient(circle at center, rgba(212, 175, 55, 0.16), rgba(250, 248, 245, 0) 68%), #faf8f5;
    cursor: pointer;
    transition: opacity 700ms ease;
}

.zen-video-overlay.is-playing {
    pointer-events: none;
    opacity: 0;
}

.zen-video-ring {
    position: absolute;
    border: 1px solid #d4a853;
    border-radius: 50%;
    opacity: 0.2;
}

.zen-video-ring-outer {
    inset: 8%;
}

.zen-video-ring-inner {
    inset: 22%;
}

.zen-video-play {
    position: relative;
    z-index: 1;
    display: grid;
    width: 68px;
    height: 68px;
    place-items: center;
    border: 1px solid #d4a853;
    border-radius: 50%;
    background: #d4a853;
    transition: transform 250ms ease, background-color 250ms ease, color 250ms ease;
}

.zen-video-overlay:hover .zen-video-play,
.zen-video-overlay:focus-visible .zen-video-play {
    color: #faf8f5;
    background: #8b0000;
    border-color: #8b0000;
    transform: scale(1.06);
}

.zen-video-marker {
    width: 36px;
    height: 1px;
    margin: 12px auto 0;
    background: #d4a853;
}

.zen-video-unavailable {
    margin: 0 0 22px;
    padding: 14px;
    color: #6b5847;
    border: 1px solid #e8dfc8;
    background: #f1efe7;
}

.challenge-panel {
    box-sizing: border-box;
    width: min(460px, 90vw);
    max-height: 92vh;
    overflow-y: auto;
    padding: 40px 44px;
    background: #faf8f5;
    border: 1px solid #e8dfc8;
    border-radius: 2px;
    color: #3e2a24;
    font-family: "Poppins", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    text-align: center;
    box-shadow: 0 20px 50px rgba(62, 42, 36, 0.35), 0 1px 2px rgba(212, 168, 83, 0.25);
}

.challenge-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 28px;
}

.challenge-lotus {
    width: 48px;
    height: 48px;
    color: #d4a853;
}

.challenge-rule {
    width: 96px;
    height: 1px;
    background: #d4a853;
    margin-top: 16px;
    opacity: 0.5;
}

.challenge-eyebrow {
    margin: 12px 0 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #d4a853;
}

.challenge-title {
    margin: 0 0 28px;
    font-size: 26px;
    font-weight: 600;
    font-style: italic;
    line-height: 1.3;
    color: #3e2a24;
}

.challenge-quote {
    margin: 0 0 12px;
    font-size: 26px;
    font-weight: 600;
    font-style: italic;
    line-height: 1.4;
    color: #3e2a24;
}

.challenge-desc {
    margin: 0 0 28px;
    font-size: 15px;
    line-height: 1.6;
    color: #6b5847;
    font-family: "Poppins", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}

.challenge-timer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin: 0 0 14px;
    font-family: "Poppins", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}

.challenge-timer-label {
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #8a7440;
}

.challenge-timer-value {
    font-size: 42px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: #3e2a24;
    font-family: "Poppins", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}

.challenge-progress {
    width: 100%;
    height: 3px;
    border-radius: 999px;
    background: #e8dfc8;
    margin: 0 0 24px;
    overflow: hidden;
}

.challenge-progress-fill {
    height: 100%;
    background: #d4a853;
    transition: width 250ms linear;
}

.challenge-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    margin-bottom: 8px;
}

.challenge-card {
    width: 100%;
    padding: 16px 20px;
    border-radius: 4px;
    border: 1px solid #e8dfc8;
    background: #f1efe7;
    color: #3e2a24;
    font: inherit;
    font-size: 15px;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.challenge-card:hover {
    background: #efe9d7;
    border-color: #d4a853;
    transform: translateY(-1px);
}

.challenge-card-title {
    font-weight: 600;
    font-size: 16px;
}

.challenge-card-desc {
    font-size: 13px;
    color: #6b5847;
    line-height: 1.4;
    font-family: "Poppins", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}

.challenge-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
}

.challenge-awaken {
    position: relative;
    width: 100%;
    padding: 12px 32px;
    border: 1px solid #d4a853;
    background: transparent;
    color: #3e2a24;
    font-family: "Poppins", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    font-size: 16px;
    letter-spacing: 0.4px;
    cursor: pointer;
    overflow: hidden;
    transition: color 300ms ease, border-color 300ms ease;
}

.challenge-awaken::before {
    content: "";
    position: absolute;
    inset: 0;
    width: 0;
    background: #8b0000;
    transition: width 300ms ease-out;
}

.challenge-awaken-label {
    position: relative;
    z-index: 1;
}

.challenge-awaken:hover {
    border-color: #8b0000;
    color: #faf8f5;
}

.challenge-awaken:hover::before {
    width: 100%;
}

.challenge-skip {
    border: none;
    background: none;
    color: #6b5847;
    font-family: "Poppins", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    transition: color 150ms ease;
}

.challenge-skip:hover {
    color: #8b0000;
}
`
