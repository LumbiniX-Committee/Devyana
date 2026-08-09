import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { cn } from "../../lib/utils";

export interface NegativeWorkItem {
	category: string;
	totalMinutes: number;
	sessionCount: number;
	description: string;
}

const FONT = '"Georgia", "Times New Roman", serif';

const BLUSH = "#F6E3DF";
const RED_BROWN = "#B85C4A";

const CATEGORY_EMOJI: Record<string, string> = {
	dopamine_shorts: "▶️",
	social_media: "💬",
	gambling: "🎰",
	adult_content: "🌊",
	gaming: "🕹️",
	streaming: "📺",
	entertainment: "🎬",
	shopping: "🛍️",
	browsing: "🧭",
};

function emojiFor(category: string): string {
	return CATEGORY_EMOJI[category] ?? "🌀";
}

export function formatMinutes(value: number): string {
	const minutes = Math.round(Number(value) || 0);
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

interface NegativeWorksSectionProps {
	className?: string;
}

/** Horizontal, scrollable row of "unwholesome activity" cards for the past
 *  week. Clicking a card's "How to correct?" button opens the advice route. */
export default function NegativeWorksSection({
	className,
}: NegativeWorksSectionProps) {
	const navigate = useNavigate();
	const [items, setItems] = useState<NegativeWorkItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const range = useMemo(() => {
		const end = dayjs();
		const start = end.subtract(6, "day");
		return {
			startDate: start.format("YYYY-MM-DD"),
			endDate: end.format("YYYY-MM-DD"),
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		invoke<NegativeWorkItem[]>("get_negative_works", {
			startDate: range.startDate,
			endDate: range.endDate,
		})
			.then((rows) => {
				if (cancelled) return;
				setItems(rows ?? []);
				setError(null);
			})
			.catch((err) => {
				if (cancelled) return;
				console.error(err);
				setError(String(err));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [range]);

	return (
		<section className={cn("flex w-full flex-col gap-3", className)}>
			<div className="flex items-baseline justify-between">
				<h2 className="buddha-heading text-base" style={{ color: "#5C4B3A" }}>
					Negative Works
				</h2>
				<span
					className="text-xs"
					style={{ color: "#85705B", fontFamily: FONT }}
				>
					Unwholesome time, seen kindly · this week
				</span>
			</div>

			{error ? (
				<p className="rounded-2xl border px-4 py-6 text-center text-sm text-red-800/70">
					Could not load your negative works: {error}
				</p>
			) : loading && items.length === 0 ? (
				<div
					className="flex items-center gap-2 rounded-2xl border px-4 py-6 text-sm"
					style={{ color: "#85705B", fontFamily: FONT }}
				>
					<Loader2 className="h-4 w-4 animate-spin" />
					Reflecting on the week…
				</div>
			) : items.length === 0 ? (
				<div
					className="rounded-2xl border px-4 py-6 text-center text-sm"
					style={{ color: "#85705B", fontFamily: FONT, fontStyle: "italic" }}
				>
					A clear week — no unwholesome activity to correct. May it continue.
				</div>
			) : (
				<div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
					{items.map((item) => (
						<article
							key={item.category}
							className="flex w-[240px] shrink-0 flex-col gap-3 rounded-3xl border p-5 transition-transform duration-200 hover:-translate-y-0.5"
							style={{
								backgroundColor: BLUSH,
								borderColor: "rgba(184, 92, 74, 0.4)",
								boxShadow: "0 10px 26px rgba(120, 60, 40, 0.10)",
							}}
						>
							<div
								className="grid h-10 w-10 place-items-center rounded-full"
								style={{
									backgroundColor: "rgba(255, 255, 255, 0.55)",
									border: `1px solid ${RED_BROWN}`,
								}}
								aria-hidden
							>
								<span className="text-lg">{emojiFor(item.category)}</span>
							</div>

							<div>
								<h3
									className="text-sm font-semibold"
									style={{ color: "#6A3B2E", fontFamily: FONT }}
								>
									{item.description}
								</h3>
								<p className="mt-1 text-xs" style={{ color: "#8A5748" }}>
									{formatMinutes(item.totalMinutes)} · {item.sessionCount}{" "}
									sessions
								</p>
							</div>

							<button
								type="button"
								onClick={() =>
									navigate(
										`/negative-works?category=${encodeURIComponent(item.category)}`,
									)
								}
								className="mt-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[#B85C4A] hover:text-white"
								style={{ borderColor: RED_BROWN, color: RED_BROWN }}
							>
								How to correct?
								<ArrowRight className="h-3.5 w-3.5" />
							</button>
						</article>
					))}
				</div>
			)}
		</section>
	);
}
