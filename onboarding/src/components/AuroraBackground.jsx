import { motion } from "framer-motion";
import { Starfield } from "@/components/Starfield";

/**
 * Space background with an electric-blue aurora rising from the bottom-centre.
 * `intensity` (0 → 1) grows through the onboarding flow so the glow builds up.
 * `flood` (0 → 1) fills the whole screen with blue for the final "all set" step.
 */
export const AuroraBackground = ({ intensity = 0, flood = 0 }) => {
  const ease = [0.22, 1, 0.36, 1];
  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      {/* Full-screen blue flood for the closing step */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, hsl(224 88% 16%) 0%, hsl(216 92% 30%) 48%, hsl(205 100% 62%) 100%)",
        }}
        initial={false}
        animate={{ opacity: flood }}
        transition={{ duration: 1.1, ease }}
      />

      {/* Starfield sits above the flood but below the glow */}
      <Starfield />

      {/* Rising aurora glow, core anchored to the bottom-centre of the viewport */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 68% at 50% 104%, hsl(197 100% 90% / 0.98) 0%, hsl(205 100% 68% / 0.92) 14%, hsl(214 100% 56% / 0.8) 30%, hsl(222 92% 42% / 0.45) 52%, transparent 75%)",
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

      {/* Soft top vignette to keep the wordmark crisp */}
      <div
        className="absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "linear-gradient(180deg, hsl(0 0% 0% / 0.55), transparent)",
        }}
      />
    </div>
  );
};
