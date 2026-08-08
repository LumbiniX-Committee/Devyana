import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const ease = [0.22, 1, 0.36, 1];

/** First question: capture the seeker's name so Vinaya can greet them personally. */
export const NameStep = ({ initialName, onSubmit }) => {
  const clean = !initialName || initialName === "friend" ? "" : initialName;
  const [value, setValue] = useState(clean);

  const submit = (e) => {
    e.preventDefault();
    onSubmit(value.trim() || "friend");
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease }}
        className="w-full max-w-md text-center"
      >
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          What may I call you?
        </h1>
        <p className="mt-3 text-base font-medium text-foreground/80">
          So Vinaya can greet you by name.
        </p>

        <form onSubmit={submit} className="glass-card mt-9 flex items-center gap-2 rounded-2xl p-2 pl-5">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your name"
            className="w-full bg-transparent py-3 text-lg text-foreground placeholder:text-foreground/40 focus:outline-none"
            aria-label="Your name"
          />
          <button
            type="submit"
            aria-label="Continue"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
          >
            <ArrowRight className="h-5 w-5" strokeWidth={2.1} />
          </button>
        </form>
        <p className="mt-4 text-xs text-foreground/40">Press Enter to continue</p>
      </motion.div>
    </div>
  );
};
