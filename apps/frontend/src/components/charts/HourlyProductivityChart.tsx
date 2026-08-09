import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

/** Narrowest visible block (as a % of the window) so sub-minute sessions stay
 *  traceable instead of rendering as an invisible sliver. */
const MIN_BLOCK_WIDTH_PCT = 2.5;
/** Cursor threshold for rendering the hostname inside a block. */
const LABEL_WIDTH_PCT = 9;

const FONT = '"Georgia", "Times New Roman", serif';

const COLORS = {
	ink: "#5C4B3A",
	mutedInk: "#85705B",
	grid: "#E0D7C6",
	sage: "#8B9A6E",
	terracotta: "#C17A5A",
	gold: "#D4A853",
	parchment: "#FBF7F0",
	boxBorder: "rgba(92, 75, 58, 0.14)",
	tooltipBg: "#2B2116",
};

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

function colorForCategory(category: string | null | undefined): string {
	switch (verdictFor(category)) {
		case "Good":
			return COLORS.sage;
		case "Bad":
			return COLORS.terracotta;
		default:
			return COLORS.gold;
	}
}

function formatTime(epochMs: number): string {
	return dayjs(epochMs).format("h:mm a");
}

function formatMinutes(ms: number): string {
	const mins = ms / 60_000;
	return mins < 1 ? "<1 min" : `${Math.round(mins)} min`;
}

function minutesOrZero(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Greedy interval packing: assigns each session to the first row whose last
 * block ends before it starts, creating new rows only when every existing row
 * is occupied. This yields the "stack by stack" rows — back-to-back visits sit
 * side-by-side on the same track, overlapping windows cascade onto new tracks.
 */
function layoutTracks(blocks: DayTimelineBlock[]): DayTimelineBlock[][] {
	const sorted = [...blocks].sort(
		(a, b) => a.startedAt - b.startedAt || a.endedAt - b.endedAt,
	);
	const tracks: DayTimelineBlock[][] = [];
	for (const block of sorted) {
		const index = tracks.findIndex(
			(track) => track[track.length - 1].endedAt <= block.startedAt,
		);
		if (index >= 0) tracks[index].push(block);
		else tracks.push([block]);
	}
	return tracks;
}

interface WindowRange {
	start: number;
	end: number;
	spanMs: number;
}

/** True span of a day's activity, floored/ceiled to the hour for clean ticks. */
function computeWindow(blocks: DayTimelineBlock[]): WindowRange | null {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const block of blocks) {
		if (block.durationMs <= 0) continue;
		min = Math.min(min, block.startedAt);
		max = Math.max(max, block.endedAt);
	}
	if (!Number.isFinite(min)) return null;

	const start = Math.floor(min / HOUR_MS) * HOUR_MS;
	let end = Math.ceil(max / HOUR_MS) * HOUR_MS;
	if (end - start < HOUR_MS) end = start + HOUR_MS;
	return { start, end, spanMs: end - start };
}

interface HourlyProductivityChartProps {
	className?: string;
}

/**
 * Today's Vinaya — a single stacked-block graph of the day's tracked sessions.
 * Each website visit is a bar parked on the X-axis at `startedAt`, widened by
 * `durationMs`, sitcked onto rows so overlapping sessions don't collide, and
 * tinted by the Intelligence Layer verdict (Good / Passive / Bad).
 */
export default function HourlyProductivityChart({
	className,
}: HourlyProductivityChartProps) {
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

	const window = useMemo(() => computeWindow(blocks), [blocks]);

	const hourTicks = useMemo(() => {
		if (!window) return [];
		const stepHours = Math.max(1, Math.ceil(window.spanMs / HOUR_MS / 6));
		const ticks: number[] = [];
		for (let t = window.start; t <= window.end; t += stepHours * HOUR_MS) {
			ticks.push(t);
		}
		return ticks;
	}, [window]);

	const tracks = useMemo(() => layoutTracks(blocks), [blocks]);

	const summary = useMemo(() => {
		const totalMs = blocks.reduce(
			(sum, b) => sum + minutesOrZero(b.durationMs),
			0,
		);
		const siteCount = new Set(blocks.map((b) => b.hostname)).size;
		return { totalMs, siteCount };
	}, [blocks]);

	return (
		<div
			className={cn("rounded-3xl border p-5 sm:p-6", className)}
			style={{
				backgroundColor: COLORS.parchment,
				borderColor: "rgba(92, 75, 58, 0.16)",
				boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
			}}
		>
			<div className="mb-4 flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2
						className="text-base font-semibold tracking-wide"
						style={{ color: COLORS.ink, fontFamily: FONT }}
					>
						Today&apos;s Vinaya
					</h2>
					<div className="mt-1.5 flex items-center gap-1.5">
						<button
							type="button"
							onClick={() => shiftDay(-1)}
							aria-label="Previous day"
							className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-black/5"
							style={{ color: COLORS.ink }}
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<span
							className="text-xs"
							style={{ color: COLORS.ink, opacity: 0.65, fontFamily: FONT }}
						>
							{cursor.format("ddd, D MMM YYYY")}
						</span>
						<button
							type="button"
							onClick={() => shiftDay(1)}
							disabled={isToday}
							aria-label="Next day"
							className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-black/5 disabled:opacity-30"
							style={{ color: COLORS.ink }}
						>
							<ChevronRight className="h-4 w-4" />
						</button>
						<button
							type="button"
							onClick={() => setCursor(dayjs().startOf("day"))}
							disabled={isToday}
							className="rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-black/5 disabled:opacity-30"
							style={{
								color: COLORS.ink,
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
					style={{ color: COLORS.mutedInk }}
				>
					<span className="flex items-center gap-1.5">
						<span
							className="h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: COLORS.sage }}
						/>
						Good
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: COLORS.gold }}
						/>
						Passive
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: COLORS.terracotta }}
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
					style={{ color: COLORS.ink, opacity: 0.55, fontFamily: FONT }}
				>
					Sitting with the data…
				</div>
			) : blocks.length === 0 ? (
				<div
					className="flex h-64 flex-col items-center justify-center gap-2 text-sm"
					style={{ color: COLORS.ink, opacity: 0.55, fontFamily: FONT }}
				>
					No websites tracked this day — a deeply still one.
				</div>
			) : window ? (
				<div className="flex flex-col gap-3">
					<p
						className="text-xs"
						style={{ color: COLORS.mutedInk, fontFamily: FONT }}
					>
						{blocks.length} sessions across {summary.siteCount}{" "}
						{summary.siteCount === 1 ? "site" : "sites"} ·{" "}
						{formatMinutes(summary.totalMs)} tracked
					</p>

					<div
						className="flex flex-col gap-2 rounded-2xl border bg-white/60 px-4 py-4"
						style={{ borderColor: COLORS.boxBorder }}
					>
						<div className="mt-1 flex flex-col gap-1.5">
							{tracks.map((track, row) => (
								<div
									key={track[0]?.id ?? `track-${row}`}
									className="relative min-h-11"
									style={{
										height: 44,
										backgroundImage: `linear-gradient(to right, ${COLORS.grid}21 1px, transparent 1px)`,
										backgroundSize: `${100 / 6}% 100%`,
										borderRadius: 10,
									}}
								>
									{track.map((block) => {
										const color = colorForCategory(block.aiCategory);
										const verdict = verdictFor(block.aiCategory);
										const leftPct =
											((block.startedAt - window.start) / window.spanMs) * 100;
										const widthPct = Math.max(
											MIN_BLOCK_WIDTH_PCT,
											(block.durationMs / window.spanMs) * 100,
										);
										return (
											<div
												key={block.id}
												className="group/block absolute top-1/2 h-8 -translate-y-1/2 cursor-default"
												style={{
													left: `${leftPct}%`,
													width: `${widthPct}%`,
												}}
											>
												<div
													className="flex h-full w-full items-center overflow-hidden rounded-lg border px-1.5 transition-transform group-hover/block:scale-[1.03]"
													style={{
														backgroundColor: `${color}CC`,
														borderColor: `${color}`,
														boxShadow: `0 6px 14px ${color}2E`,
													}}
												>
													{widthPct >= LABEL_WIDTH_PCT && (
														<span
															className="truncate pl-0.5 text-[11px] leading-none font-medium text-white"
															style={{
																fontFamily: FONT,
																textShadow: "0 1px 2px rgba(40,25,10,0.35)",
															}}
														>
															{block.hostname}
														</span>
													)}
												</div>

												<div className="pointer-events-none absolute top-[calc(100%+6px)] left-1/2 z-20 hidden w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-white/10 bg-black/90 px-3 py-2 text-xs text-white shadow-xl group-hover/block:block">
													<p className="flex items-center gap-1.5 font-semibold">
														<span
															className="h-2 w-2 shrink-0 rounded-full"
															style={{ backgroundColor: color }}
														/>
														{block.hostname}
													</p>
													<p className="mt-1 whitespace-nowrap text-white/80">
														{formatTime(block.startedAt)} –{" "}
														{formatTime(block.endedAt)}
													</p>
													<p className="text-white/70">
														{formatMinutes(block.durationMs)} · {verdict}
													</p>
												</div>
											</div>
										);
									})}
								</div>
							))}

							<div
								className="relative"
								style={{
									backgroundImage: `linear-gradient(to right, ${COLORS.grid}55 1px, transparent 1px)`,
									backgroundSize: `${100 / 6}% 100%`,
								}}
							>
								{hourTicks.map((tick) => {
									const leftPct = ((tick - window.start) / window.spanMs) * 100;
									return (
										<span
											key={tick}
											className="absolute -translate-x-1/2 pt-1 text-[10px]"
											style={{
												left: `${leftPct}%`,
												color: COLORS.mutedInk,
												fontFamily: FONT,
											}}
										>
											{formatTime(tick)}
										</span>
									);
								})}
							</div>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
