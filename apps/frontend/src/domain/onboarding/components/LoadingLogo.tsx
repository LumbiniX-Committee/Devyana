import { motion } from "framer-motion";

/**
 * Opening loader — a glossy golden "v" (Vinaya) that spins on the warm ivory stage.
 * The spin is a transform, so it automatically calms under reduced-motion (MotionConfig).
 */
export const LoadingLogo = () => {
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-background">
			<div
				style={{ perspective: 800 }}
				className="flex flex-col items-center gap-4"
			>
				<motion.div
					className="loader-e select-none text-7xl leading-none"
					style={{ transformStyle: "preserve-3d" }}
					animate={{ rotateY: 360 }}
					transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}
				>
					v
				</motion.div>
				<span className="wordmark text-sm tracking-[0.35em] text-foreground/45">
					विनय
				</span>
			</div>
		</div>
	);
};
