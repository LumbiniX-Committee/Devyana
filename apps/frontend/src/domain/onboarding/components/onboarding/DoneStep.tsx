import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "../../../../lib/utils";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface DoneStepProps {
	onStart: () => void;
	loading?: boolean;
	accepted: boolean;
	onToggle: () => void;
	onOpenPolicy: () => void;
}

/** Closing "All set" celebration + privacy consent + primary CTA. */
export const DoneStep = ({
	onStart,
	loading = false,
	accepted,
	onToggle,
	onOpenPolicy,
}: DoneStepProps) => {
	return (
		<div className="flex min-h-screen w-full flex-col items-center justify-center px-6 text-center">
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, ease }}
				className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground/95"
			>
				<span className="grid h-6 w-6 place-items-center rounded-full bg-foreground/20">
					<Check className="h-4 w-4" strokeWidth={2.4} />
				</span>
				All set
			</motion.div>

			<motion.h1
				initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
				animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
				transition={{ duration: 0.9, ease, delay: 0.1 }}
				className="text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-6xl"
			>
				Let&apos;s begin
				<br />
				the journey
			</motion.h1>

			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, ease, delay: 0.42 }}
				className="mt-8"
			>
				<label className="group flex cursor-pointer items-center gap-3 text-left">
					<input
						type="checkbox"
						checked={accepted}
						onChange={accepted ? onToggle : onOpenPolicy}
						className="peer sr-only"
						aria-label="I agree to the Privacy Policy"
					/>
					<span
						aria-hidden="true"
						className={cn(
							"grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors",
							accepted
								? "border-primary bg-primary text-primary-foreground"
								: "border-foreground/35 group-hover:border-foreground/60",
						)}
					>
						{accepted && (
							<motion.span
								initial={{ scale: 0.4, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								transition={{ duration: 0.2, ease }}
							>
								<Check className="h-3.5 w-3.5" strokeWidth={3} />
							</motion.span>
						)}
					</span>
					<span className="text-sm leading-snug text-foreground/75">
						I agree to Vinaya&apos;s{" "}
						<button
							type="button"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								onOpenPolicy();
							}}
							className="cursor-pointer font-semibold text-foreground underline decoration-primary/60 underline-offset-2"
						>
							Privacy Policy
						</button>
					</span>
				</label>
			</motion.div>

			<motion.button
				initial={{ opacity: 0, y: 16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, ease, delay: 0.55 }}
				whileHover={loading ? undefined : { y: -2 }}
				whileTap={loading ? undefined : { scale: 0.97 }}
				onClick={onStart}
				disabled={loading}
				className="glass-pill mt-6 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
			>
				{loading ? "Entering Vinaya…" : "Enter Vinaya"}
				<ArrowRight className="h-4 w-4" strokeWidth={2} />
			</motion.button>
		</div>
	);
};
