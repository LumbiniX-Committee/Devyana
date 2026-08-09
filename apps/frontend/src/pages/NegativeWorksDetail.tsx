import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { ArrowLeft, Flower2, Loader2, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { lotusBackground } from "../lib/lotus";
import "./buddha.css";

export interface CorrectionAdvice {
	category: string;
	title: string;
	steps: string[];
}

const CATEGORY_LABEL: Record<string, string> = {
	dopamine_shorts: "YouTube Shorts",
	social_media: "Social Media",
	gambling: "Gambling",
	adult_content: "Adult Content",
	gaming: "Gaming",
	streaming: "Streaming",
	entertainment: "Entertainment",
	shopping: "Online Shopping",
	browsing: "Mindless Browsing",
};

function labelFor(category: string): string {
	return (
		CATEGORY_LABEL[category] ??
		category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
	);
}

const BREATH_SECONDS = 30;

type BreathPhase = "in" | "hold" | "out";

function phaseFor(elapsed: number): BreathPhase {
	const cycle = elapsed % 8;
	if (cycle < 4) return "in";
	if (cycle < 6) return "hold";
	return "out";
}

const PHASE_HINT: Record<BreathPhase, string> = {
	in: "Breathe in deeply…",
	hold: "Hold gently…",
	out: "Breathe out fully…",
};

function BreathingTimer() {
	const [seconds, setSeconds] = useState(BREATH_SECONDS);
	const [running, setRunning] = useState(false);

	useEffect(() => {
		if (!running) return;
		if (seconds <= 0) {
			setRunning(false);
			return;
		}
		const timeout = setTimeout(() => setSeconds((s) => s - 1), 1000);
		return () => clearTimeout(timeout);
	}, [running, seconds]);

	const start = () => {
		setSeconds(BREATH_SECONDS);
		setRunning(true);
	};

	const stop = () => {
		setRunning(false);
		setSeconds(BREATH_SECONDS);
	};

	const elapsed = BREATH_SECONDS - seconds;
	const phase: BreathPhase = running ? phaseFor(elapsed) : "in";

	return (
		<div className="flex flex-col items-center gap-6 py-2">
			<div className="relative grid h-56 w-56 place-items-center">
				{/* Orbit rings */}
				<div
					className="absolute inset-0 rounded-full border"
					style={{ borderColor: "rgba(184, 92, 74, 0.18)" }}
				/>
				<div
					className="absolute inset-4 rounded-full border"
					style={{ borderColor: "rgba(139, 154, 110, 0.28)" }}
				/>
				<motion.div
					className="grid h-40 w-40 place-items-center rounded-full"
					style={{
						backgroundImage: lotusBackground({
							stroke: "#8B9A6E",
							opacity: 0.5,
							size: 160,
						}),
						backgroundColor: "#FDF8F2",
						boxShadow: "0 18px 44px rgba(60, 40, 20, 0.14)",
					}}
					animate={{
						scale: running
							? phase === "in"
								? 1.06
								: phase === "hold"
									? 1.06
									: 0.72
							: 1,
					}}
					transition={{ duration: phase === "hold" ? 2 : 4, ease: "easeInOut" }}
				>
					<div className="text-center">
						<p className="buddha-heading text-4xl" style={{ color: "#5C4B3A" }}>
							{seconds}
						</p>
						<p
							className="text-[11px] uppercase tracking-widest"
							style={{ color: "#85705B" }}
						>
							{seconds === 1 ? "second" : "seconds"}
						</p>
					</div>
				</motion.div>
			</div>

			<p
				className="text-sm"
				style={{ color: running ? "#B85C4A" : "#85705B", fontStyle: "italic" }}
			>
				{running ? PHASE_HINT[phase] : "Take a calm, 30-second pause."}
			</p>

			<button
				type="button"
				onClick={running ? stop : start}
				className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95"
				style={{
					backgroundColor: "#B85C4A",
					boxShadow: "0 10px 24px rgba(184, 92, 74, 0.35)",
				}}
			>
				{running ? (
					<Square className="h-4 w-4" />
				) : (
					<Play className="h-4 w-4" />
				)}
				{running ? "End the pause" : "Try now"}
			</button>
		</div>
	);
}

/** Dedicated correction-advice route: `/negative-works?category=<category>`.
 *  Calm, Buddha‑inspired guidance with a mindful breathing timer. */
export default function NegativeWorksDetail() {
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const category = params.get("category") ?? "generic";

	const [advice, setAdvice] = useState<CorrectionAdvice | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		document.body.setAttribute("data-buddha-theme", "");
		return () => document.body.removeAttribute("data-buddha-theme");
	}, []);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setAdvice(null);
		setError(null);
		invoke<CorrectionAdvice>("get_correction_advice", { category })
			.then((res) => {
				if (cancelled) return;
				setAdvice(res);
			})
			.catch((err) => {
				if (cancelled) return;
				console.error(err);
				setError(String(err));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [category]);

	return (
		<div
			className="relative min-h-screen w-full overflow-hidden"
			style={{ backgroundColor: "#FBF7F0" }}
		>
			{/* Mandala watermark */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					backgroundImage: lotusBackground({
						stroke: "#8B9A6E",
						opacity: 0.08,
						size: 160,
					}),
					backgroundAttachment: "fixed",
				}}
				aria-hidden
			/>

			<div className="relative mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-8 sm:px-6">
				<button
					type="button"
					onClick={() => navigate("/dashboard")}
					className="inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5"
					style={{ borderColor: "#E0D7C6", color: "#5C4B3A" }}
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					Back to dashboard
				</button>

				<header className="flex flex-col items-center gap-4 pt-4 text-center">
					<div
						className="grid h-20 w-20 place-items-center rounded-full border"
						style={{
							backgroundImage: lotusBackground({
								stroke: "#C17A5A",
								opacity: 0.55,
								size: 80,
							}),
							borderColor: "rgba(193, 122, 90, 0.45)",
							backgroundColor: "#FDF3EC",
						}}
						aria-hidden
					>
						<Flower2 className="h-8 w-8" style={{ color: "#8B9A6E" }} />
					</div>
					<div>
						<h1
							className="buddha-heading text-2xl"
							style={{ color: "#5C4B3A" }}
						>
							{loading
								? "Gathering wisdom…"
								: advice
									? advice.title
									: "A mindful return"}
						</h1>
						<p className="mt-1 text-sm" style={{ color: "#85705B" }}>
							Correction for {labelFor(category)}
						</p>
					</div>
				</header>

				{error ? (
					<div
						className="rounded-2xl border px-5 py-6 text-center text-sm text-red-800/80"
						style={{
							backgroundColor: "#FDF8F2",
							borderColor: "rgba(184, 92, 74, 0.3)",
						}}
					>
						The advice could not be read: {error}
					</div>
				) : loading || !advice ? (
					<div
						className="flex items-center justify-center gap-2 rounded-2xl border px-5 py-10 text-sm"
						style={{
							backgroundColor: "#FDF8F2",
							borderColor: "rgba(92, 75, 58, 0.14)",
							color: "#85705B",
						}}
					>
						<Loader2 className="h-4 w-4 animate-spin" />
						Resting the mind…
					</div>
				) : (
					<>
						<ol className="flex flex-col gap-3">
							{advice.steps.map((step, index) => (
								<motion.li
									key={`${advice.category}-${step}`}
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: index * 0.12, duration: 0.4 }}
									className="flex items-start gap-3 rounded-2xl border px-4 py-3"
									style={{
										backgroundColor: "#FDF8F2",
										borderColor: "rgba(92, 75, 58, 0.14)",
										boxShadow: "0 6px 18px rgba(60, 40, 20, 0.05)",
									}}
								>
									<span
										className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold"
										style={{ backgroundColor: "#F6E3DF", color: "#B85C4A" }}
									>
										{index + 1}
									</span>
									<p
										className="text-sm leading-relaxed"
										style={{ color: "#5C4B3A" }}
									>
										{step}
									</p>
								</motion.li>
							))}
						</ol>

						<div
							className="mt-2 rounded-3xl border p-6"
							style={{
								backgroundColor: "#FDF8F2",
								borderColor: "rgba(139, 154, 110, 0.4)",
								boxShadow: "0 12px 30px rgba(60, 40, 20, 0.08)",
							}}
						>
							<h2
								className="buddha-heading mb-1 text-center text-sm"
								style={{ color: "#5C4B3A" }}
							>
								A breathing space
							</h2>
							<BreathingTimer />
						</div>

						<p
							className="pt-2 text-center text-xs"
							style={{ color: "#85705B", fontStyle: "italic" }}
						>
							Progress is not the absence of falling, but the willingness to
							begin again.
						</p>
					</>
				)}
			</div>
		</div>
	);
}
