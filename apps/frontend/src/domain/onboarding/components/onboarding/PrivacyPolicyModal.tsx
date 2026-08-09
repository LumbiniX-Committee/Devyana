import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, X } from "lucide-react";
import { useEffect } from "react";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface PrivacyPolicyModalProps {
	open: boolean;
	onClose: () => void;
	onAccept: () => void;
}

const SECTIONS = [
	{
		title: "What we collect",
		body: "We collect only what's needed to understand your digital habits: the apps and sites you use, time spent, session patterns, and general interaction data. We never collect passwords, private messages, or payment details.",
	},
	{
		title: "Why we collect it",
		body: "To help you reflect on your digital behaviour through Buddhist principles of mindfulness, balance, and compassion. The data fuels your dashboard, the AI‑monk guidance, and the Buddha’s Palm moments—not ads or profiling.",
	},
	{
		title: "Local by design",
		body: "Your profile and everyday activity are stored on your device. Raw data is minimised and aggregated before any optional cloud processing. Vinaya works offline for enforcement and only talks to the cloud when needed.",
	},
	{
		title: "What the AI sees",
		body: "The Intelligence Layer receives only summarised patterns—behavioural categories, time buckets, and aggregated insights—not raw keystrokes, private conversations, or identifiable files. It uses that context to offer monk‑style advice.",
	},
	{
		title: "No training on you",
		body: "We do not use your personal data to train public AI models. When third-party AI services are used, we configure them so your information is not retained for model improvement unless you give separate consent.",
	},
	{
		title: "Your control",
		body: "You can pause or stop tracking at any time, disable the browser extension, turn off the desktop agent, or delete your account and all associated data. Deleting your profile removes everything Vinaya holds about you.",
	},
	{
		title: "No selling, ever",
		body: "We do not sell, rent, or trade your personal digital‑activity information. Anonymised, aggregate statistics may help us improve the app, but they are never tied back to an individual.",
	},
	{
		title: "Security",
		body: "We protect your data with encryption in transit, access controls, secure APIs, and regular security reviews. While no internet service is 100% secure, we treat your privacy as sacred ground.",
	},
	{
		title: "How long we keep it",
		body: "We retain data only as long as necessary to provide the service and historical insights. After that, it is deleted or de-identified. You can request deletion at any time from Settings.",
	},
	{
		title: "Contact",
		body: "If you have questions or wish to exercise your rights, email us at hello@vinaya.app. We'll respond within a few sunrises—and always with compassion.",
	},
];

/** Closable privacy-policy popup shown before entering the app. */
export const PrivacyPolicyModal = ({
	open,
	onClose,
	onAccept,
}: PrivacyPolicyModalProps) => {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	return (
		<AnimatePresence>
			{open && (
				<div className="fixed inset-0 z-[60] grid place-items-center p-4 sm:p-6">
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25 }}
						onClick={onClose}
						className="absolute inset-0 bg-foreground/25 backdrop-blur-sm"
						aria-hidden="true"
					/>

					<motion.div
						initial={{ opacity: 0, y: 24, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 16, scale: 0.97 }}
						transition={{ duration: 0.35, ease }}
						role="dialog"
						aria-modal="true"
						aria-label="Privacy Policy"
						className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-foreground/10 bg-popover text-popover-foreground shadow-2xl shadow-amber-950/20"
					>
						<header className="flex items-center gap-3 px-6 pt-6 pb-4">
							<span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
								<ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
							</span>
							<div className="flex-1">
								<h2 className="text-lg font-semibold tracking-tight">
									Vinaya Privacy Policy
								</h2>
								<p className="text-xs text-muted-foreground">
									Last updated · August 2026
								</p>
							</div>
							<button
								onClick={onClose}
								type="button"
								aria-label="Close privacy policy"
								className="icon-btn grid h-9 w-9 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
							>
								<X className="h-5 w-5" strokeWidth={1.8} />
							</button>
						</header>

						<div className="flex-1 space-y-5 overflow-y-auto px-6 py-2 pb-6 no-scrollbar">
							<p className="text-sm leading-relaxed text-foreground/80">
								Vinaya is a calm, private companion for your mind. This policy
								explains, in plain words, what happens with the small amount of
								data you share.
							</p>
							{SECTIONS.map((s) => (
								<section key={s.title}>
									<h3 className="mb-1 text-sm font-semibold text-foreground">
										{s.title}
									</h3>
									<p className="text-sm leading-relaxed text-foreground/75">
										{s.body}
									</p>
								</section>
							))}
						</div>

						<footer className="flex items-center justify-end gap-3 border-t border-foreground/10 bg-foreground/[0.03] px-6 py-4">
							<button
								onClick={onClose}
								type="button"
								className="rounded-full px-4 py-2 text-sm font-medium text-foreground/60 transition-colors hover:text-foreground"
							>
								Not now
							</button>
							<button
								onClick={onAccept}
								type="button"
								className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95"
							>
								<ShieldCheck className="h-4 w-4" strokeWidth={2} />I agree
							</button>
						</footer>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
};
