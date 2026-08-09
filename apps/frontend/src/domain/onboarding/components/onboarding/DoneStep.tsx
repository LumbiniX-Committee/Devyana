import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface DoneStepProps {
	onStart: () => void;
	loading?: boolean;
}

/** Closing "All set" celebration + primary CTA. */
export const DoneStep = ({ onStart, loading = false }: DoneStepProps) => {
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

			<motion.button
				initial={{ opacity: 0, y: 16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, ease, delay: 0.45 }}
				whileHover={loading ? undefined : { y: -2 }}
				whileTap={loading ? undefined : { scale: 0.97 }}
				onClick={onStart}
				disabled={loading}
				className="glass-pill mt-10 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
			>
				{loading ? "Entering Vinaya…" : "Enter Vinaya"}
				<ArrowRight className="h-4 w-4" strokeWidth={2} />
			</motion.button>
		</div>
	);
};
