import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface AgeStepProps {
	initialAge?: number;
	onSubmit: (age: number) => void;
}

/** Capture the seeker's age so Vinaya can meet them where they are. */
export const AgeStep = ({ initialAge, onSubmit }: AgeStepProps) => {
	const [value, setValue] = useState(initialAge ? String(initialAge) : "");

	const submit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const age = Number.parseInt(value, 10);
		if (!value || Number.isNaN(age) || age < 1 || age > 120) return;
		onSubmit(age);
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
					How old are you?
				</h1>
				<p className="mt-3 text-base font-medium text-foreground/80">
					So Vinaya can meet you where you are.
				</p>

				<form
					onSubmit={submit}
					className="glass-card mt-9 flex items-center gap-2 rounded-2xl p-2 pl-5"
				>
					<input
						// biome-ignore lint/a11y/noAutofocus: the age field is the only interactive control on this screen
						autoFocus
						type="number"
						inputMode="numeric"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="Your age"
						minLength={1}
						className="w-full bg-transparent py-3 text-lg text-foreground placeholder:text-foreground/40 focus:outline-none"
						aria-label="Your age"
					/>
					<button
						type="submit"
						aria-label="Continue"
						disabled={!value}
						className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
					>
						<ArrowRight className="h-5 w-5" strokeWidth={2.1} />
					</button>
				</form>
				<p className="mt-4 text-xs text-foreground/40">
					Press Enter to continue
				</p>
			</motion.div>
		</div>
	);
};
