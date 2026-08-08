import { motion, type Variants } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

const container: Variants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } },
};
const item: Variants = {
	hidden: { opacity: 0, y: 16 },
	show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};

export interface ChoiceOption {
	id: string;
	label: string;
	Icon: LucideIcon;
}

interface ChoiceStepProps {
	title: string;
	subtitle: string;
	options: ChoiceOption[];
	onSelect: (label: string) => void;
}

/**
 * Reusable single-choice step (used for both the profession and the goal screens).
 * `options` = [{ id, label, Icon }]
 */
export const ChoiceStep = ({
	title,
	subtitle,
	options,
	onSelect,
}: ChoiceStepProps) => {
	return (
		<div className="flex min-h-screen w-full flex-col items-center justify-center px-6 py-28">
			<motion.div
				initial={{ opacity: 0, y: 18 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, ease }}
				className="mb-9 text-center"
			>
				<h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
					{title}
				</h1>
				<p className="mt-3 text-base font-medium text-foreground/85 sm:text-lg">
					{subtitle}
				</p>
			</motion.div>

			<motion.div
				variants={container}
				initial="hidden"
				animate="show"
				className="flex w-full max-w-lg flex-col gap-3"
			>
				{options.map(({ id, label, Icon }) => (
					<motion.button
						key={id}
						variants={item}
						onClick={() => onSelect(label)}
						whileHover={{ y: -2 }}
						whileTap={{ scale: 0.985 }}
						className="glass-card group flex items-center justify-between rounded-2xl px-5 py-4 text-left"
					>
						<span className="flex items-center gap-3">
							<Icon className="h-5 w-5 text-foreground/80" strokeWidth={1.6} />
							<span className="text-base font-semibold text-foreground">
								{label}
							</span>
						</span>
						<ArrowRight
							className="h-5 w-5 text-foreground/55 transition-all duration-300 group-hover:translate-x-1 group-hover:text-foreground"
							strokeWidth={1.8}
						/>
					</motion.button>
				))}
			</motion.div>
		</div>
	);
};
