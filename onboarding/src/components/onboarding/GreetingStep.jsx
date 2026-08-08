import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1];

/** Brief personalised greeting. Click anywhere / auto-advances. */
export const GreetingStep = ({ name }) => {
  return (
    <div className="flex min-h-screen w-full items-center justify-center px-6">
      <motion.h1
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
        transition={{ duration: 0.55, ease }}
        className="text-center text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
      >
        Namaste, {name}
      </motion.h1>
    </div>
  );
};
