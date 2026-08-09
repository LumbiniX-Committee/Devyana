import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { lotusBackground } from "../lib/lotus";
import { DEMO_LEARNING_PATHWAY } from "./learning/demoPathway";
import { LessonViewer } from "./learning/LessonViewer";
import { PathwayMap } from "./learning/PathwayMap";
import type { LessonNode, PathwayData } from "./learning/types";

const INK = "#5C4B3A";
const MUTED = "#85705B";
const LEARNING_PROGRESS_KEY = "vinaya_learning_completed_lessons";

function savedCompletedLessonIds() {
	try {
		const saved = JSON.parse(localStorage.getItem(LEARNING_PROGRESS_KEY) ?? "[]");
		return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
	} catch {
		return new Set<string>();
	}
}

function applySavedProgress(pathway: PathwayData) {
	const completedIds = savedCompletedLessonIds();
	return {
		...pathway,
		nodes: pathway.nodes.map((lesson) => ({
			...lesson,
			status: completedIds.has(lesson.id) ? "completed" : lesson.status,
		})),
	};
}

export default function LearningPathway() {
	useEffect(() => {
		document.body.setAttribute("data-buddha-theme", "");
		return () => document.body.removeAttribute("data-buddha-theme");
	}, []);

	const [pathway, setPathway] = useState<PathwayData>(() => applySavedProgress(DEMO_LEARNING_PATHWAY));
	const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		// The desktop returns AI-tailored practices when recent activity is
		// available. The local demo remains a complete offline/web fallback.
		void invoke<PathwayData>("get_learning_pathway")
			.then((nextPathway) => {
				if (!cancelled && nextPathway.nodes.length) setPathway(applySavedProgress(nextPathway));
			})
			.catch(() => undefined);

		return () => {
			cancelled = true;
		};
	}, []);

	const selectedLesson = pathway.nodes.find((lesson) => lesson.id === selectedLessonId) ?? null;

	const handleSelectLesson = (lesson: LessonNode) => {
		setSelectedLessonId(lesson.id);
	};

	const handleCompleteLesson = (lessonId: string) => {
		const lessonIndex = pathway.nodes.findIndex((lesson) => lesson.id === lessonId);
		const nextLesson = pathway.nodes.slice(lessonIndex + 1).find((lesson) => lesson.status !== "completed");
		const completedIds = savedCompletedLessonIds();
		completedIds.add(lessonId);
		localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify([...completedIds]));

		setPathway((current) => ({
			...current,
			nodes: current.nodes.map((lesson) =>
				lesson.id === lessonId ? { ...lesson, status: "completed" } : lesson,
			),
		}));
		setSelectedLessonId(nextLesson?.id ?? null);
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
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B9A6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
								<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
							</svg>
						</div>
						<div>
							<h1 className="buddha-heading text-2xl leading-tight" style={{ color: INK }}>
								Learning Pathway
							</h1>
							<p className="text-xs" style={{ color: MUTED }}>
								Walk the Noble Eightfold Path with guided teachings and stories.
							</p>
						</div>
					</div>
					{pathway.generatedByAi && (
						<span className="rounded-full border px-3 py-1 text-xs" style={{ color: "#8B9A6E", borderColor: "rgba(139, 154, 110, 0.35)", backgroundColor: "rgba(139, 154, 110, 0.08)" }}>
							AI-tailored practices
						</span>
					)}
				</header>

				<div className="flex flex-col gap-6 lg:flex-row">
					<div className="min-w-0 flex-1">
						<PathwayMap pathway={pathway} selectedLessonId={selectedLessonId} onSelectLesson={handleSelectLesson} />
					</div>

					<div className="w-full flex-shrink-0 lg:w-96">
						<LessonViewer lesson={selectedLesson} onClose={() => setSelectedLessonId(null)} onComplete={handleCompleteLesson} />
					</div>
				</div>

				<footer className="pt-2 pb-4 text-center text-xs" style={{ color: MUTED, fontFamily: '"Georgia", serif' }}>
					&ldquo;Just as a candle cannot burn without fire, men cannot live without a spiritual life.&rdquo; - the Buddha
				</footer>
			</div>
		</div>
	);
}
