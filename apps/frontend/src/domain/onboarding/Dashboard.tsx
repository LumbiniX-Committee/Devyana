import { MotionConfig, motion } from "framer-motion";
import { ArrowUp, RotateCcw, Sparkles, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import ProductivityGraph from "../../components/ProductivityGraph";
import TaskPanel from "../../components/TaskPanel";
import { AuroraBackground } from "./components/AuroraBackground";
import { TopBar } from "./components/TopBar";
import { toast } from "./components/ui/sonner";
import "./onboarding.css";

const SUGGESTIONS = [
	"Ease my anxiety right now",
	"Guide a 5-minute breathing space",
	"A teaching on letting go",
	"How do I begin meditating?",
];

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function Dashboard() {
	const navigate = useNavigate();
	const [prompt, setPrompt] = useState("");

	// Scope the aurora design system to this experience (covers portal surfaces).
	useEffect(() => {
		document.body.setAttribute("data-onboarding-theme", "");
		return () => document.body.removeAttribute("data-onboarding-theme");
	}, []);

	const name =
		(typeof window !== "undefined" && localStorage.getItem("vinaya_name")) ||
		"friend";
	const role =
		(typeof window !== "undefined" && localStorage.getItem("vinaya_role")) ||
		null;
	const goal =
		(typeof window !== "undefined" && localStorage.getItem("vinaya_goal")) ||
		null;

	const reflect = () => {
		if (!prompt.trim()) {
			toast("Share what's on your mind first.");
			return;
		}
		toast.success("Vinaya is reflecting\u2026", {
			description: prompt.trim().slice(0, 80),
		});
		setPrompt("");
	};

	const restart = () => {
		localStorage.removeItem("vinaya_onboarded");
		navigate("/onboarding");
	};

	return (
		<MotionConfig reducedMotion="user">
			<div className="onboarding-shell relative min-h-screen w-full overflow-hidden">
				<AuroraBackground intensity={0.28} flood={0} />
				<TopBar onLogoClick={() => {}} />

				<div className="relative z-20 flex min-h-screen w-full flex-col items-center justify-center px-6">
					<motion.div
						initial={{ opacity: 0, y: 18 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, ease }}
						className="w-full max-w-2xl text-center"
					>
						<div className="mb-4 flex flex-wrap items-center justify-center gap-2">
							{role && (
								<span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-foreground/80">
									<Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
									{role}
								</span>
							)}
							{goal && (
								<span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-foreground/80">
									<Target className="h-3.5 w-3.5" strokeWidth={1.8} />
									{goal}
								</span>
							)}
						</div>

						<h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
							What&apos;s on your mind, {name}?
						</h1>
						<p className="mt-3 text-base font-medium text-foreground/75">
							Ask Vinaya anything, or begin a guided practice.
						</p>

						<div className="glass-card mt-8 rounded-3xl p-3 text-left">
							<textarea
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								placeholder="Share what is weighing on your mind…"
								rows={3}
								className="no-scrollbar w-full resize-none bg-transparent px-3 py-2 text-base text-foreground placeholder:text-foreground/40 focus:outline-none"
							/>
							<div className="flex items-center justify-between px-1 pb-1">
								<span className="text-xs text-foreground/45">
									Prototype · mindful companion
								</span>
								<button
									onClick={reflect}
									type="button"
									className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
									aria-label="Ask Vinaya"
								>
									<ArrowUp className="h-5 w-5" strokeWidth={2.2} />
								</button>
							</div>
						</div>

						<div className="mt-5 flex flex-wrap items-center justify-center gap-2">
							{SUGGESTIONS.map((s) => (
								<button
									key={s}
									onClick={() => setPrompt(s)}
									type="button"
									className="rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-sm text-foreground/80 transition-colors hover:border-white/30 hover:text-foreground"
								>
									{s}
								</button>
							))}
						</div>

						<button
							onClick={restart}
							type="button"
							className="mt-10 inline-flex items-center gap-1.5 text-sm text-foreground/50 transition-colors hover:text-foreground/80"
						>
							<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
							Replay onboarding
						</button>
					</motion.div>
				</div>

				<div className="relative z-20 mx-auto mb-16 grid w-full max-w-5xl gap-6 px-6 md:grid-cols-[1.15fr_minmax(280px,0.85fr)]">
					<motion.section
						initial={{ opacity: 0, y: 18 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, ease, delay: 0.15 }}
						className="glass-card rounded-3xl p-5 sm:p-6"
					>
						<div className="mb-4 flex items-baseline justify-between">
							<h2 className="text-base font-semibold text-foreground">
								Productivity graph
							</h2>
							<span className="text-xs text-foreground/45">
								Your focus, day by day
							</span>
						</div>
						<ProductivityGraph />
					</motion.section>

					<motion.div
						initial={{ opacity: 0, y: 18 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, ease, delay: 0.25 }}
					>
						<TaskPanel />
					</motion.div>
				</div>
			</div>
		</MotionConfig>
	);
}
