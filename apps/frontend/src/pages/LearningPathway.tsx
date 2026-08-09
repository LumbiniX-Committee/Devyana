import { useEffect, useState } from "react";
import { lotusBackground } from "../lib/lotus";
import { PathwayMap } from "./learning/PathwayMap";
import { LessonViewer } from "./learning/LessonViewer";

interface LessonNode {
  id: string;
  title: string;
  description: string;
  type: "text" | "video";
  content: {
    body?: string;
    audioLang?: string;
    src?: string;
    poster?: string;
    subtitles?: Array<{ srclang: string; label: string; src: string; default?: boolean }>;
  };
  status: "locked" | "available" | "completed";
  position: { x: number; y: number };
}

const INK = "#5C4B3A";
const MUTED = "#85705B";

export default function LearningPathway() {
	useEffect(() => {
		document.body.setAttribute("data-buddha-theme", "");
		return () => document.body.removeAttribute("data-buddha-theme");
	}, []);

	const [selectedLesson, setSelectedLesson] = useState<LessonNode | null>(null);

	const handleSelectLesson = (lesson: LessonNode) => {
		if (lesson.status !== "locked") {
			setSelectedLesson(lesson);
		}
	};

	const handleCloseLesson = () => {
		setSelectedLesson(null);
	};

	const handleCompleteLesson = (_lessonId: string) => {
	};

	return (
		<div
			className="relative min-h-screen w-full"
			style={{
				backgroundColor: "#FBF7F0",
				backgroundImage: lotusBackground({
					stroke: "#8B9A6E",
					opacity: 0.07,
					size: 140,
				}),
				backgroundAttachment: "fixed",
			}}
		>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-6">
				<header className="flex flex-wrap items-center justify-between gap-3 pb-1">
					<div className="flex items-center gap-3">
						<div
							className="grid h-11 w-11 place-items-center rounded-full"
							style={{
								backgroundImage: lotusBackground({
									stroke: "#8B9A6E",
									opacity: 0.85,
									size: 44,
								}),
								backgroundColor: "#FDF8F2",
								border: "1px solid rgba(139, 154, 110, 0.18)",
							}}
							aria-hidden
						>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#8B9A6E"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
								<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
							</svg>
						</div>
						<div>
							<h1 className="buddha-heading text-2xl leading-tight" style={{ color: INK }}>
								Learning Pathway
							</h1>
							<p className="text-xs" style={{ color: MUTED }}>
								Walk the Noble Eightfold Path with guided teachings.
							</p>
						</div>
					</div>
				</header>

				<div className="flex flex-col lg:flex-row gap-6">
					<div className="flex-1 min-w-0">
						<PathwayMap
							pathway={{
								id: "eightfold-path",
								title: "The Noble Eightfold Path",
								description: "A calm journey through the Buddha&apos;s practical guide to liberation, reflection, and wise action.",
								nodes: [
									{
										id: "right-view",
										title: "Right View",
										description: "Understanding suffering, its cause, its ending, and the path that leads beyond it.",
										type: "text",
										content: {
											audioLang: "en-US",
											body: `Right View begins with seeing experience clearly. The Buddha named this clarity through the Four Noble Truths: that suffering exists, that it has causes, that it can cease, and that there is a practical path toward freedom.

This lesson is not about adopting a belief. It is an invitation to look directly at life: moments of grasping, moments of release, and the quiet intelligence that appears when we stop turning away.

Practice: for one minute, notice one pleasant, one unpleasant, and one neutral sensation. Observe each without adding a story. This is the first step of seeing.`
										},
										status: "available",
										position: { x: 12, y: 11 }
									},
									{
										id: "right-intention",
										title: "Right Intention",
										description: "The resolve of renunciation, kindness, and harmlessness in daily choices.",
										type: "video",
										content: {
											src: "/videos/right-intention.mp4",
											poster: "/images/right-intention-poster.svg",
											subtitles: [
												{ srclang: "en", label: "English", src: "/subtitles/right-intention-en.vtt", default: true }
											]
										},
										status: "locked",
										position: { x: 35, y: 22 }
									},
									{
										id: "right-speech",
										title: "Right Speech",
										description: "Speaking with truth, care, usefulness, and timely restraint.",
										type: "text",
										content: {
											audioLang: "en-US",
											body: `Right Speech asks us to treat words as actions. A sentence can soothe or unsettle, clarify or confuse, build trust or weaken it.

The training is practical: avoid falsehood, divisive speech, harshness, and idle talk. In their place, cultivate speech that is true, beneficial, gentle, and timely.

Practice: before sending one message today, pause and ask: is it true, is it useful, and is this the right time?`
										},
										status: "locked",
										position: { x: 48, y: 36 }
									},
									{
										id: "right-action",
										title: "Right Action",
										description: "Conduct that protects life, trust, boundaries, and dignity.",
										type: "text",
										content: {
											audioLang: "en-US",
											body: `Right Action brings the path into the body. It asks that our behavior reduce harm and strengthen steadiness.

The classical training includes refraining from taking life, taking what is not given, and misusing sensuality. In contemporary life, this includes honoring consent, stewardship, and the quiet responsibilities of care.

Practice: choose one ordinary action today and perform it with full attention, neither rushing nor neglecting its impact.`
										},
										status: "locked",
										position: { x: 66, y: 50 }
									},
									{
										id: "right-livelihood",
										title: "Right Livelihood",
										description: "Earning and contributing in ways that do not trade wellbeing for gain.",
										type: "video",
										content: {
											src: "/videos/right-livelihood.mp4",
											poster: "/images/right-intention-poster.svg",
											subtitles: []
										},
										status: "locked",
										position: { x: 51, y: 64 }
									},
									{
										id: "right-effort",
										title: "Right Effort",
										description: "A balanced energy that prevents, releases, cultivates, and sustains wholesome states.",
										type: "text",
										content: {
											audioLang: "en-US",
											body: `Right Effort is neither strain nor passivity. It is the steady care that notices which seeds we are watering.

The Buddha described four efforts: prevent unwholesome states from arising, abandon those that have arisen, cultivate wholesome states, and maintain them once present.

Practice: name one mental habit you want to stop feeding, and one quality you want to nourish with small repeated attention.`
										},
										status: "locked",
										position: { x: 29, y: 77 }
									},
									{
										id: "right-mindfulness",
										title: "Right Mindfulness",
										description: "Remembering to observe body, feeling, mind, and patterns with steady presence.",
										type: "text",
										content: {
											audioLang: "en-US",
											body: `Right Mindfulness is the capacity to know what is happening while it is happening. It is not a special mood. It is clear presence.

The four foundations invite observation of the body, feelings, mind states, and the patterns that shape experience. This knowing is gentle, precise, and unforced.

Practice: take three breaths and silently note: body sitting, breath moving, mind knowing.`
										},
										status: "locked",
										position: { x: 49, y: 88 }
									},
									{
										id: "right-concentration",
										title: "Right Concentration",
										description: "Collected attention that gathers the mind into calm, clarity, and depth.",
										type: "text",
										content: {
											audioLang: "en-US",
											body: `Right Concentration steadies attention until the mind becomes unified. It is cultivated through patience, ethical grounding, and repeated returning.

Concentration is not escape. It supports seeing clearly by reducing the scattering that keeps us reactive.

Practice: choose a single breath sensation and return to it kindly each time attention wanders. Returning is the practice.`
										},
										status: "locked",
										position: { x: 83, y: 93 }
									}
								]
							}}
							selectedLessonId={selectedLesson?.id ?? null}
							onSelectLesson={handleSelectLesson}
						/>
					</div>

					<div className="w-full lg:w-96 flex-shrink-0">
						<LessonViewer
							lesson={selectedLesson ?? null}
							onClose={handleCloseLesson}
							onComplete={handleCompleteLesson}
						/>
					</div>
				</div>

				<footer
					className="pt-2 pb-4 text-center text-xs"
					style={{ color: MUTED, fontFamily: '"Georgia", serif' }}
				>
					&ldquo;Just as a candle cannot burn without fire, men cannot live without a spiritual life.&rdquo; — the Buddha
				</footer>
			</div>
		</div>
	);
}