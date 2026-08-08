import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { cn } from "../../../../lib/utils";

/**
 * Bottom-centre progress indicator with a Back control.
 * `total` = number of questions, `index` = current 0-based question,
 * `onBack` = go to previous question (hidden on the first one).
 */
interface StepNavProps {
	total: number;
	index: number;
	onBack: () => void;
}

export const StepNav = ({ total, index, onBack }: StepNavProps) => {
	return (
		<motion.div
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 16 }}
			transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
			className="fixed inset-x-0 bottom-8 z-40 flex items-center justify-center gap-5"
		>
			{index > 0 ? (
				<button
					onClick={(e) => {
						e.stopPropagation();
						onBack();
					}}
					type="button"
					className="glass-pill inline-flex items-center gap-1.5 rounded-full py-2 pl-3 pr-4 text-sm font-medium text-foreground"
					aria-label="Go back"
				>
					<ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
					Back
				</button>
			) : (
				<div className="h-9 w-[76px]" aria-hidden="true" />
			)}

			<div
				className="flex items-center gap-2"
				role="progressbar"
				aria-valuenow={index + 1}
				aria-valuemax={total}
			>
				{Array.from({ length: total }).map((_, i) => {
					return (
						<motion.span
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed static progress dots, never reordered
							key={`progress-dot-${i}`}
							animate={{ width: i === index ? 26 : 8 }}
							transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
							className={cn(
								"h-2 rounded-full",
								i === index
									? "bg-primary"
									: i < index
										? "bg-foreground/60"
										: "bg-foreground/25",
							)}
						/>
					);
				})}
			</div>

			<div className="h-9 w-[76px]" aria-hidden="true" />
		</motion.div>
	);
};
