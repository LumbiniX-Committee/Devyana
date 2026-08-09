import { invoke } from "@tauri-apps/api/core";
import dayjs, { type Dayjs } from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../lib/utils";

export interface DayProductivity {
	date: string;
	score: number;
	focusHours: number;
	distractionHours: number;
	tasksCompleted: number;
	pomodoroSessions: number;
}

interface CellMeta {
	day: Dayjs;
	entry?: DayProductivity;
}

/** Five contribution levels, gray (none) to deep green (high). */
const CELL_COLORS = [
	"rgba(120, 120, 128, 0.16)",
	"rgba(46, 160, 67, 0.35)",
	"rgba(46, 160, 67, 0.55)",
	"rgba(46, 160, 67, 0.78)",
	"rgba(26, 127, 55, 1)",
];

const WEEKDAY_LABELS: Array<{ key: string; label: string }> = [
	{ key: "sun", label: "Sun" },
	{ key: "mon", label: "Mon" },
	{ key: "tue", label: "Tue" },
	{ key: "wed", label: "Wed" },
	{ key: "thu", label: "Thu" },
	{ key: "fri", label: "Fri" },
	{ key: "sat", label: "" },
];

function levelFor(score: number): number {
	if (score <= 0) return 0;
	if (score < 0.25) return 1;
	if (score < 0.5) return 2;
	if (score < 0.75) return 3;
	return 4;
}

function formatHours(value: number): string {
	return value > 0 ? `${value.toFixed(1)}h` : "—";
}

interface ProductivityGraphProps {
	className?: string;
}

/** GitHub-style contribution grid for the productivity score.
 *
 * Renders the visible month as a 7 × N weeks grid, fetches `get_productivity_grid`
 * for the encompassed date range and re-fetches whenever the visible month
 * changes (arrow buttons or scroll).
 */
export default function ProductivityGraph({
	className,
}: ProductivityGraphProps) {
	const [cursorMonth, setCursorMonth] = useState(() =>
		dayjs().startOf("month"),
	);
	const [items, setItems] = useState<DayProductivity[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { rangeStart, rangeEnd } = useMemo(() => {
		const start = cursorMonth.startOf("month").startOf("week");
		const end = cursorMonth.endOf("month").endOf("week");
		return { rangeStart: start, rangeEnd: end };
	}, [cursorMonth]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		invoke<DayProductivity[]>("get_productivity_grid", {
			startDate: rangeStart.format("YYYY-MM-DD"),
			endDate: rangeEnd.format("YYYY-MM-DD"),
		})
			.then((data) => {
				if (cancelled) return;
				setItems(data);
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
	}, [rangeStart, rangeEnd]);

	const columns = useMemo<CellMeta[][]>(() => {
		const byDate = new Map(items.map((i) => [i.date, i]));
		const cols: CellMeta[][] = [];
		const cursor = rangeStart;
		const totalWeeks = Math.round(rangeEnd.diff(rangeStart, "day") / 7);
		for (let w = 0; w < totalWeeks; w++) {
			const week: CellMeta[] = [];
			for (let d = 0; d < 7; d++) {
				const day = cursor.add(w * 7 + d, "day");
				week.push({ day, entry: byDate.get(day.format("YYYY-MM-DD")) });
			}
			cols.push(week);
		}
		return cols;
	}, [items, rangeStart, rangeEnd]);

	const shiftMonth = (delta: number) =>
		setCursorMonth((m) => m.add(delta, "month"));

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => shiftMonth(-1)}
						className="grid h-7 w-7 place-items-center rounded-full opacity-70 transition-opacity hover:bg-white/10 hover:opacity-100"
						aria-label="Previous month"
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={() => shiftMonth(1)}
						className="grid h-7 w-7 place-items-center rounded-full opacity-70 transition-opacity hover:bg-white/10 hover:opacity-100"
						aria-label="Next month"
					>
						<ChevronRight className="h-4 w-4" />
					</button>
				</div>
				<span className="text-sm font-medium opacity-80">
					{cursorMonth.format("MMMM YYYY")}
				</span>
			</div>

			<div
				className="flex items-start"
				onWheel={(e) => {
					if (e.deltaY > 24) shiftMonth(1);
					else if (e.deltaY < -24) shiftMonth(-1);
				}}
			>
				<div className="mr-2 flex h-full flex-col gap-[3px] text-[10px] leading-[11px] opacity-45">
					{WEEKDAY_LABELS.map((row) => (
						<span key={row.key} className="h-3">
							{row.label || "\u00a0"}
						</span>
					))}
				</div>
				<div className="flex h-[102px] flex-1 gap-[3px]">
					{columns.map((week) => {
						const weekKey = week[0]?.day.format("YYYY-MM-DD");
						return (
							<div
								key={weekKey}
								className="flex h-full flex-1 flex-col gap-[3px]"
							>
								{week.map((cell) => {
									const entry = cell.entry;
									const level = levelFor(entry?.score ?? 0);
									return (
										<div
											key={cell.day.format("YYYY-MM-DD")}
											className="group/grid relative flex-1"
										>
											<div
												className={cn(
													"h-full w-full rounded-[3px] transition-transform group-hover/grid:scale-125",
													loading && !entry && "animate-pulse",
												)}
												style={{ backgroundColor: CELL_COLORS[level] }}
											/>
											<div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-3 py-2 text-xs text-white shadow-xl group-hover/grid:block">
												<p className="font-semibold">
													{cell.day.format("DD MMM YYYY")}
												</p>
												{entry ? (
													<>
														<p className="mt-1 text-white/80">
															Score{" "}
															<span className="font-medium text-white">
																{(entry.score * 100).toFixed(0)}%
															</span>
														</p>
														<p className="text-white/70">
															{formatHours(entry.focusHours)} focused ·{" "}
															{formatHours(entry.distractionHours)} distracted
														</p>
														<p className="text-white/70">
															{entry.tasksCompleted} tasks completed
														</p>
													</>
												) : (
													<p className="text-white/70">No activity</p>
												)}
											</div>
										</div>
									);
								})}
							</div>
						);
					})}
				</div>
			</div>

			{error && (
				<p className="text-xs text-red-400/90">Failed to load grid: {error}</p>
			)}

			<div className="flex items-center gap-2 text-[11px] opacity-50">
				<span>Less</span>
				{CELL_COLORS.map((color) => (
					<span
						key={color}
						className="h-3 w-3 rounded-[3px]"
						style={{ backgroundColor: color }}
					/>
				))}
				<span>More</span>
			</div>
		</div>
	);
}
