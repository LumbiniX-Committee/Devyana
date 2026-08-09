import { invoke } from "@tauri-apps/api/core";
import dayjs, { type Dayjs } from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useChartPalette } from "../../lib/chartPalette";
import { cn } from "../../lib/utils";

/** One `session_end` block, straight from the `get_timeline` command. */
export interface DayTimelineBlock {
	id: string;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	aiCategory: string | null;
	hostname: string;
	url: string;
}

export interface DayTimeline {
	date: string;
	blocks: DayTimelineBlock[];
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
/** The chart always spans 12 hour-columns: current hour − 6 … current hour + 6. */
const COLS = 12;
/** Each column's height represents one hour (60 minutes) of the clock. */
const PLOT_HEIGHT = 300;
const Y_TICKS = [0, 10, 20, 30, 40, 50, 60];

const COL_W = 100 / COLS;
/** Every signal shares the same bar width inside its hour-column. */
const BAR_W = COL_W * 0.52;
const BAR_MIN_HEIGHT_PX = 3;

const FONT = '"Poppins", sans-serif';

const PRODUCTIVE_CATEGORIES = [
	"productive",
	"deep_work",
	"learning",
	"research",
	"coding",
	"writing",
	"planning",
	"reading",
	"analysis",
];

const DISTRACTING_CATEGORIES = [
	"distracting",
	"dopamine_shorts",
	"social_media",
	"gaming",
	"streaming",
	"entertainment",
	"shopping",
	"browsing",
	"gambling",
	"adult_content",
];

type Verdict = "Good" | "Bad" | "Passive";

function verdictFor(category: string | null | undefined): Verdict {
	const c = (category ?? "neutral").trim().toLowerCase();
	if (PRODUCTIVE_CATEGORIES.includes(c)) return "Good";
	if (DISTRACTING_CATEGORIES.includes(c)) return "Bad";
	return "Passive";
}

function colorForCategory(
	category: string | null | undefined,
	colors: ReturnType<typeof useChartPalette>,
): string {
	switch (verdictFor(category)) {
		case "Good":
			return colors.sage;
		case "Bad":
			return colors.terracotta;
		default:
			return colors.gold;
	}
}

function formatMinutes(ms: number): string {
	const mins = ms / MINUTE_MS;
	return mins < 1 ? "<1 min" : `${Math.round(mins)} min`;
}

/** The window is anchored on the selected day at the *current wall-clock hour*,
 *  so for today it literally reads "now − 6 … now + 6", and other days show the
 *  same clock frame of that day. */
function windowCenter(cursorDay: Dayjs): Dayjs {
	const nowWallClock = dayjs();
	return cursorDay
		.startOf("day")
		.hour(nowWallClock.hour())
		.minute(0)
		.second(0)
		.millisecond(0);
}

interface WindowRange {
	start: number;
	end: number;
}

function computeWindow(cursorDay: Dayjs): WindowRange {
	const center = windowCenter(cursorDay);
	return {
		start: center.subtract(COLS / 2, "hour").valueOf(),
		end: center.add(COLS / 2, "hour").valueOf(),
	};
}

interface HourlyProductivityChartProps {
	className?: string;
}

/**
 * Today's Vinaya — a 12 hour-column grid around the current hour. Each visit
 * is a fixed-width signal in the column of the HOUR it started;
 * its Y position is the minute/second of that hour it began,
 * and its height is how long it was used. Since apps aren't run
 * simultaneously, signals never have to overlap.
 */
export default function HourlyProductivityChart({
	className,
}: HourlyProductivityChartProps) {
	const colors = useChartPalette();
	const [cursor, setCursor] = useState(() => dayjs().startOf("day"));
	const [blocks, setBlocks] = useState<DayTimelineBlock[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const selectedDate = cursor.format("YYYY-MM-DD");
	const isToday = cursor.isSame(dayjs(), "day");

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		invoke<DayTimeline>("get_timeline", { date: selectedDate })
			.then((timeline) => {
				if (cancelled) return;
				setBlocks((timeline?.blocks ?? []).filter((b) => b.durationMs > 0));
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
	}, [selectedDate]);

	const shiftDay = (delta: number) => {
		if (delta > 0 && isToday) return;
		setCursor((c) => c.add(delta, "day"));
	};

	const window = useMemo(() => computeWindow(cursor), [cursor]);
	const centerMs = window.start + (COLS / 2) * HOUR_MS;

	/** Only sessions whose starting hour falls inside the 12 columns. */
	const visible = useMemo(
		() =>
			blocks.filter(
				(b) => b.startedAt >= window.start && b.startedAt < window.end,
			),
		[blocks, window],
	);

	const summary = useMemo(() => {
		const totalMs = visible.reduce(
			(sum, b) =>
				sum + (Number.isFinite(b.durationMs) ? Math.max(0, b.durationMs) : 0),
			0,
		);
		const siteCount = new Set(visible.map((b) => b.hostname)).size;
		return { totalMs, siteCount };
	}, [visible]);

	return (
		<div
			className={cn("rounded-3xl border p-5 sm:p-6", className)}
			style={{
				backgroundColor: colors.parchment,
				borderColor: "rgba(92, 75, 58, 0.16)",
				boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
			}}
		>
			<div className="mb-4 flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2
						className="text-base font-semibold tracking-wide"
						style={{ color: colors.ink, fontFamily: FONT }}
					>
						Today&apos;s Vinaya
					</h2>
					<div className="mt-1.5 flex items-center gap-1.5">
						<button
							type="button"
							onClick={() => shiftDay(-1)}
							aria-label="Previous day"
							className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-black/5"
							style={{ color: colors.ink }}
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<span
							className="text-xs"
							style={{ color: colors.ink, opacity: 0.65, fontFamily: FONT }}
						>
							{cursor.format("ddd, D MMM YYYY")}
						</span>
						<button
							type="button"
							onClick={() => shiftDay(1)}
							disabled={isToday}
							aria-label="Next day"
							className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-black/5 disabled:opacity-30"
							style={{ color: colors.ink }}
						>
							<ChevronRight className="h-4 w-4" />
						</button>
						<button
							type="button"
							onClick={() => setCursor(dayjs().startOf("day"))}
							disabled={isToday}
							className="rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-black/5 disabled:opacity-30"
							style={{
								color: colors.ink,
								borderColor: "rgba(224, 215, 198, 1)",
								fontFamily: FONT,
							}}
						>
							Today
						</button>
					</div>
				</div>

				<div
					className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
					style={{ color: colors.mutedInk }}
				>
					<span className="flex items-center gap-1.5">
						<span
							className="h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: colors.sage }}
						/>
						Good
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: colors.gold }}
						/>
						Passive
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: colors.terracotta }}
						/>
						Bad
					</span>
				</div>
			</div>

			{error ? (
				<p
					className="py-8 text-center text-sm text-red-800/70"
					style={{ fontFamily: FONT }}
				>
					Could not load the day&apos;s timeline: {error}
				</p>
			) : loading && blocks.length === 0 ? (
				<div
					className="flex h-72 items-center justify-center text-sm"
					style={{ color: colors.ink, opacity: 0.55, fontFamily: FONT }}
				>
					Sitting with the data…
				</div>
			) : visible.length === 0 ? (
				<div
					className="flex h-64 flex-col items-center justify-center gap-2 text-sm"
					style={{ color: colors.ink, opacity: 0.55, fontFamily: FONT }}
				>
					No sessions in the ±6 h window around {dayjs(centerMs).format("h A")}.
				</div>
			) : (
				<div className="flex flex-col gap-3">
					<p
						className="text-xs"
						style={{ color: colors.mutedInk, fontFamily: FONT }}
					>
						{visible.length} sessions across {summary.siteCount}{" "}
						{summary.siteCount === 1 ? "site" : "sites"}
						{summary.totalMs > 0 && (
							<> · {formatMinutes(summary.totalMs)} tracked</>
						)}
					</p>

					<div
						className="rounded-2xl border px-4 py-4"
						style={{
							borderColor: colors.boxBorder,
							backgroundColor: colors.plotBg,
						}}
					>
						<div className="flex gap-3">
							{/* Y axis labels (minutes past the hour) */}
							<div
								className="relative w-7 shrink-0"
								style={{ height: PLOT_HEIGHT }}
							>
								{Y_TICKS.map((value) => (
									<span
										key={value}
										className="absolute right-1 -translate-y-1/2 text-[10px] leading-none"
										style={{
											bottom: `calc(${((value / 60) * PLOT_HEIGHT).toFixed(1)}px)`,
											color: colors.mutedInk,
											fontFamily: FONT,
										}}
									>
										{value}
									</span>
								))}
								<span
									className="absolute -right-0.5 bottom-0 text-[10px]"
									style={{ color: colors.mutedInk, fontFamily: FONT }}
								>
									min
								</span>
							</div>

							{/* Plot + hour columns + X axis */}
							<div className="min-w-0 flex-1">
								<div
									className="relative overflow-visible rounded-lg"
									style={{ height: PLOT_HEIGHT }}
								>
									{/* Hour-column boundaries */}
									{Array.from({ length: COLS + 1 }, (_, i) => (
										<div
											key={window.start + i * HOUR_MS}
											className="absolute top-0 bottom-0 border-l border-dashed"
											style={{
												left: `${(i * COL_W).toFixed(2)}%`,
												borderColor:
													i === 0 || i === COLS
														? colors.grid
														: `${colors.grid}55`,
											}}
										/>
									))}

									{/* 'Now' column highlight */}
									<div
										className="absolute top-0 bottom-0"
										style={{
											left: `${((COLS / 2) * COL_W).toFixed(2)}%`,
											width: `${COL_W.toFixed(2)}%`,
											backgroundColor: `${colors.sage}12`,
										}}
									/>

									{/* Minute gridlines (0..60) */}
									{Y_TICKS.map((value) => (
										<div
											key={value}
											className="absolute right-0 left-0 border-t border-dashed"
											style={{
												bottom: `${((value / 60) * PLOT_HEIGHT).toFixed(1)}px`,
												borderColor:
													value === 0 ? colors.grid : `${colors.grid}66`,
											}}
										/>
									))}

									{visible.map((block) => {
										const color = colorForCategory(block.aiCategory, colors);
										const verdict = verdictFor(block.aiCategory);
										const idx = Math.floor(
											(block.startedAt - window.start) / HOUR_MS,
										);
										const colStartMs = window.start + idx * HOUR_MS;
										const secondsIntoHour =
											(block.startedAt - colStartMs) / 1_000;
										const topPx = (secondsIntoHour / 3_600) * PLOT_HEIGHT;
										const durSec = block.durationMs / 1_000;
										const remainingPx = PLOT_HEIGHT - topPx;
										const capped = durSec / 3_600 > remainingPx / PLOT_HEIGHT;
										const heightPx = Math.min(
											remainingPx,
											(durSec / 3_600) * PLOT_HEIGHT,
										);
										const leftPct = idx * COL_W + (COL_W - BAR_W) / 2;
										return (
											<div
												key={block.id}
												className="group absolute cursor-default"
												style={{
													left: `${leftPct.toFixed(2)}%`,
													top: `${topPx.toFixed(1)}px`,
													width: `${BAR_W.toFixed(2)}%`,
												}}
											>
												<div
													className="w-full border"
													style={{
														height: `${Math.max(
															BAR_MIN_HEIGHT_PX,
															heightPx,
														).toFixed(1)}px`,
														backgroundColor: `${color}B3`,
														borderColor: color,
														boxShadow: `0 5px 12px ${color}26`,
													}}
												/>
												{capped && (
													<span
														className="absolute -top-1 right-0 rounded-full px-1 text-[8px] leading-[10px] text-white"
														style={{ backgroundColor: color }}
														aria-hidden="true"
													>
														+
													</span>
												)}

												<div className="pointer-events-none absolute left-1/2 z-20 hidden w-max max-w-[220px] -translate-x-1/2 pb-1.5 group-hover:block">
													<div
														className="w-max max-w-[220px] rounded-lg border border-white/10 bg-black/90 px-3 py-2 text-xs text-white shadow-xl"
														style={{ fontFamily: FONT }}
													>
														<p className="flex items-center gap-1.5 font-semibold">
															<span
																className="h-2 w-2 shrink-0 rounded-full"
																style={{ backgroundColor: color }}
															/>
															{block.hostname}
														</p>
														<p className="mt-1 text-white/80">
															{dayjs(block.startedAt).format("h:mm a")} ·{" "}
															{dayjs(block.endedAt).format("h:mm a")}
														</p>
														<p className="text-white/70">
															{formatMinutes(block.durationMs)}
															{capped && " · longer than the hour"}
															{" · "}
															{verdict}
														</p>
													</div>
												</div>
											</div>
										);
									})}
								</div>

								{/* X axis: one label per hour-column */}
								<div className="relative mt-1 h-5">
									{Array.from({ length: COLS }, (_, idx) => {
										const leftPct = idx * COL_W + COL_W / 2;
										const isCenter = idx === COLS / 2;
										return (
											<span
												key={window.start + idx * HOUR_MS}
												className="absolute -translate-x-1/2 text-[10px] leading-none"
												style={{
													left: `${leftPct.toFixed(2)}%`,
													color: isCenter ? colors.sage : colors.mutedInk,
													fontFamily: FONT,
													fontWeight: isCenter ? 700 : 400,
												}}
											>
												{isCenter && isToday
													? "Now"
													: dayjs(window.start + idx * HOUR_MS).format("ha")}
											</span>
										);
									})}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
