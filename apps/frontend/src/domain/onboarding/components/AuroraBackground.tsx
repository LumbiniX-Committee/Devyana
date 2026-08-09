import { motion } from "framer-motion";
import { Starfield } from "./Starfield";

interface AuroraBackgroundProps {
	intensity?: number;
	flood?: number;
}

/**
 * Warm ivory background with a sunlit golden-yellow glow rising from the bottom-centre.
 * `intensity` (0 → 1) grows through the onboarding flow so the glow builds up.
 * `flood` (0 → 1) fills the whole screen with gold for the final "all set" step.
 */
export const AuroraBackground = ({
	intensity = 0,
	flood = 0,
}: AuroraBackgroundProps) => {
	const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];
	return (
		<div className="absolute inset-0 overflow-hidden bg-background">
			{/* Full-screen golden flood for the closing step */}
			<motion.div
				className="absolute inset-0"
				style={{
					background:
						"linear-gradient(180deg, hsl(44 55% 91%) 0%, hsl(42 75% 82%) 48%, hsl(41 95% 55%) 100%)",
				}}
				initial={false}
				animate={{ opacity: flood }}
				transition={{ duration: 1.1, ease }}
			/>

			{/* Starfield sits above the flood but below the glow */}
			<Starfield />

			{/* Rising golden glow, core anchored to the bottom-centre of the viewport */}
			<motion.div
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(58% 68% at 50% 104%, hsl(48 100% 84% / 0.92) 0%, hsl(45 95% 70% / 0.85) 14%, hsl(42 100% 56% / 0.5) 32%, hsl(40 85% 44% / 0.22) 52%, transparent 75%)",
					transformOrigin: "50% 100%",
					filter: "blur(4px)",
				}}
				initial={false}
				animate={{
					opacity: intensity <= 0 ? 0 : 0.4 + intensity * 0.6,
					scaleY: 0.55 + intensity * 0.6,
					scaleX: 0.8 + intensity * 0.35,
				}}
				transition={{ duration: 1.1, ease }}
			/>

			{/* Soft top shade to keep the wordmark crisp on the light ground */}
			<div
				className="absolute inset-x-0 top-0 h-40"
				style={{
					background:
						"linear-gradient(180deg, hsl(43 47% 92% / 0.85), transparent)",
				}}
			/>
		</div>
	);
};
