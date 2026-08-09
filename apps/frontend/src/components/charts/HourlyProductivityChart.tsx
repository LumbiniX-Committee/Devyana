import { invoke } from "@tauri-apps/api/core";
import type { ApexOptions } from "apexcharts";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ApexChart from "react-apexcharts";

import { cn } from "../../lib/utils";

export interface HourlyActivity {
	hour: number;
	totalMinutes: number;
	productiveMinutes: number;
	distractingMinutes: number;
}

type ChartMode = "total" | "focused" | "stacked";

const HOUR_RANGE = { start: 6, end: 18 }; // 06:00 – 18:00

const FONT = '"Georgia", "Times New Roman", serif';

const COLORS = {
	ricePaper: "#FBF7F0",
	ink: "#5C4B3A",
	grid: "#E0D7C6",
	sage: "#A9B87A",
	sageStroke: "#6F824A",
	terracotta: "#C79B6F",
	terracottaStroke: "#8A5B38",
	gold: "#E8C9A0",
	tooltipBg: "#2B2116",
};

function dataUri(svg: string): string {
	return `data:image/svg+xml;base64,${btoa(svg.trim())}`;
}

/** A tiled SVG lotus / mandala motif, used as an ApexCharts image fill. */
function lotusPattern(background: string, stroke: string): string {
	const rosaceOf = (petal: string) =>
		Array.from({ length: 8 }, (_, i) => {
			const angle = i * 45;
			return `<use href="#${petal}" transform="rotate(${angle} 12 12)"/>`;
		}).join("");
	return dataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <defs>
    <path id="petal" d="M12 2.6 C 13.2 6.6, 13.9 9.6, 12 12.8 C 10.1 9.6, 10.8 6.6, 12 2.6 Z"/>
    <path id="petalOuter" d="M12 9.5 C 13.4 13.4, 14.4 16.5, 12 19.5 C 9.6 16.5, 10.6 13.4, 12 9.5 Z"/>
  </defs>
  <rect width="24" height="24" fill="${background}"/>
  <g fill="none" stroke="${stroke}" stroke-width="0.5" opacity="0.7">${rosaceOf("petalOuter")}</g>
  <g fill="none" stroke="${stroke}" stroke-width="0.6" opacity="0.85">${rosaceOf("petal")}</g>
  <circle cx="12" cy="12" r="1.1" fill="${stroke}" opacity="0.8"/>
</svg>`);
}

const LOTUS_SAGE = lotusPattern(COLORS.sage, COLORS.sageStroke);
const LOTUS_TERRACOTTA = lotusPattern(COLORS.terracotta, COLORS.terracottaStroke);

const HOUR_LABELS = Array.from({ length: HOUR_RANGE.end - HOUR_RANGE.start }, (_, i) => {
	const h = HOUR_RANGE.start + i;
	if (h === 12) return "12 PM";
	return h < 12 ? `${h} AM` : `${h - 12} PM`;
});

function minutesLabel(value: number): string {
	const n = Number(value) || 0;
	return n > 0 ? `${n.toFixed(1)} min` : "—";
}

interface HourlyProductivityChartProps {
	className?: string;
}

/**
 * Today's (or any day's) tracked activity, one patterned bar per hour.
 * Fetches `get_hourly_activity` for the visible day and renders a calm,
 * lotus-tiled column chart on a warm rice-paper background.
 */
export default function HourlyProductivityChart({
	className,
}: HourlyProductivityChartProps) {
	const [cursor, setCursor] = useState(() => dayjs().startOf("day"));
	const [mode, setMode] = useState<ChartMode>("total");
	const [data, setData] = useState<HourlyActivity[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const selectedDate = cursor.format("YYYY-MM-DD");
	const isToday = cursor.isSame(dayjs(), "day");
	const totalMinutes = useMemo(
		() => data.reduce((sum, d) => sum + d.totalMinutes, 0),
		[data],
	);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		invoke<HourlyActivity[]>("get_hourly_activity", {
			date: selectedDate,
			startHour: HOUR_RANGE.start,
			endHour: HOUR_RANGE.end,
		})
			.then((rows) => {
				if (cancelled) return;
				setData(rows);
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

	const series = useMemo(() => {
		switch (mode) {
			case "focused":
				return [{ name: "Focused Minutes", data: data.map((d) => d.productiveMinutes) }];
			case "stacked":
				return [
					{ name: "Focused Minutes", data: data.map((d) => d.productiveMinutes) },
					{ name: "Relaxed Minutes", data: data.map((d) => d.distractingMinutes) },
				];
			default:
				return [{ name: "Mindful Minutes", data: data.map((d) => d.totalMinutes) }];
		}
	}, [data, mode]);

	const options = useMemo<ApexOptions>(() => {
		const stacked = mode === "stacked";
		const maxPerHour =
			stacked
				? Math.max(0, ...data.map((d) => d.productiveMinutes + d.distractingMinutes))
				: mode === "focused"
					? Math.max(0, ...data.map((d) => d.productiveMinutes))
					: Math.max(0, ...data.map((d) => d.totalMinutes));
		const yMax = Math.max(60, Math.ceil(maxPerHour / 10) * 10);

		return {
			chart: {
				type: "bar",
				background: COLORS.ricePaper,
				toolbar: { show: false },
				fontFamily: FONT,
				parentHeightOffset: 0,
				animations: { enabled: true, easing: "easeout", speed: 700 },
			},
			colors: stacked
				? [COLORS.sage, COLORS.terracotta]
				: [COLORS.sage],
			plotOptions: {
				bar: {
					borderRadius: 6,
					columnWidth: "55%",
					stacked,
				},
			},
			fill: {
				type: stacked ? ["image", "image"] : "image",
				image: {
					src: stacked ? [LOTUS_SAGE, LOTUS_TERRACOTTA] : LOTUS_SAGE,
					width: 24,
					height: 24,
				},
			},
			stroke: { show: false },
			grid: {
				borderColor: COLORS.grid,
				strokeDashArray: 4,
				padding: { left: -4, right: 4 },
			},
			xaxis: {
				categories: HOUR_LABELS,
				labels: {
					style: { colors: COLORS.ink, fontSize: "12px", fontFamily: FONT },
				},
				axisBorder: { show: false },
				axisTicks: { show: false },
			},
			yaxis: {
				min: 0,
				max: yMax,
				tickAmount: 6,
				labels: {
					style: { colors: COLORS.ink, fontSize: "12px", fontFamily: FONT },
					formatter: (value: number) => `${Math.round(value)}`,
				},
			},
			tooltip: {
				theme: "dark",
				fillSeriesColor: false,
				style: {
					color: COLORS.gold,
					fontSize: "12px",
					fontFamily: FONT,
					background: COLORS.tooltipBg,
				},
				y: {
					formatter: (value: number) => minutesLabel(value),
				},
			},
			dataLabels: {
				position: "top",
				formatter: (value: number | string) => {
					const n = Number(value);
					return n > 0 ? String(Math.round(n)) : "";
				},
				offsetY: -4,
				style: { colors: [COLORS.ink], fontSize: "11px", fontFamily: FONT },
			},
			legend: {
				show: stacked,
				position: "top",
				horizontalAlign: "right",
				labels: { colors: COLORS.ink },
				fontFamily: FONT,
				markers: { shape: "circle" },
			},
			noData: {
				text: "A quiet day — nothing tracked yet",
				style: { colors: [COLORS.ink], fontFamily: FONT },
			},
		};
	}, [data, mode]);

	return (
		<div
			className={cn("rounded-3xl border p-5 sm:p-6", className)}
			style={{
				backgroundColor: COLORS.ricePaper,
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
							onClick={() => {
								setCursor(dayjs().startOf("day"));
								setMode("total");
							}}
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

				<div className="flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: "#F2EADB" }}>
					{(
						[
							{ key: "total", label: "Total" },
							{ key: "focused", label: "Focused" },
							{ key: "stacked", label: "Focused + Relaxed" },
						] as const
					).map((item) => (
						<button
							key={item.key}
							type="button"
							onClick={() => setMode(item.key)}
							className={cn(
								"rounded-full px-3 py-1 text-xs transition-colors",
								mode === item.key && "shadow-sm",
							)}
							style={{
								color: COLORS.ink,
								fontFamily: FONT,
								fontWeight: mode === item.key ? 600 : 400,
								backgroundColor: mode === item.key ? "#FFFFFF" : "transparent",
							}}
						>
							{item.label}
						</button>
					))}
				</div>
			</div>

			{error ? (
				<p className="py-8 text-center text-sm text-red-800/70" style={{ fontFamily: FONT }}>
					Could not load the hour chart: {error}
				</p>
			) : loading && data.length === 0 ? (
				<div
					className="flex h-72 items-center justify-center text-sm"
					style={{ color: COLORS.ink, opacity: 0.55, fontFamily: FONT }}
				>
					Sitting with the data…
				</div>
			) : (
				<>
					{!loading && totalMinutes === 0 && (
						<p
							className="mb-2 text-center text-xs"
							style={{ color: COLORS.ink, opacity: 0.6, fontFamily: FONT, fontStyle: "italic" }}
						>
							Nothing tracked in these hours — a deeply still day.
						</p>
					)}
					<ApexChart options={options} series={series} type="bar" height={280} />
				</>
			)}
		</div>
	);
}