import { motion } from "framer-motion";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Transitional, mindful message. Auto-advances (click also skips). */
export const MessageStep = () => {
	return (
		<div className="flex min-h-screen w-full items-center justify-center px-6">
			<motion.h1
				initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
				animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
				exit={{ opacity: 0, y: -16, filter: "blur(6px)" }}
				transition={{ duration: 0.6, ease }}
				className="max-w-2xl text-balance text-center text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl"
			>
				A calmer, clearer mind is closer than you think. Just a few gentle
				breaths before you begin.
			</motion.h1>
		</div>
	);
};
