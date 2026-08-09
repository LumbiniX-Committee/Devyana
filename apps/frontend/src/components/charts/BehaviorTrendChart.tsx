import { invoke } from "@tauri-apps/api/core";
import type { ApexOptions } from "apexcharts";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import ApexChart from "react-apexcharts";

import { cn } from "../../lib/utils";

export interface DailyBehavior {
	date: string;
	productiveMinutes: number;
	distractingMinutes: number;
}

const FONT = '"Georgia", "Times New Roman", serif';

const COLORS = {
	ink: "#5C4B3A",
	mutedInk: "#85705B",
	grid: "#E0D7C6",
	sage: "#8B9A6E",
	terracotta: "#C17A5A",
	gold: "#D4A853",
	parchment: "#FDF8F2",
	tooltipBg: "#2B2116",
};

interface BehaviorTrendChartProps {
	/** Trailing number of days to fetch. Defaults to 30. */
	days?: number;
	className?: string;
}

/** Stacked area chart of daily productive vs. distracting minutes, fetched
 *  from `get_user_behavior_trend`. Soft gradients, smooth lines, no markers —
 *  a serene overview of the last month's behavior. */
export default function BehaviorTrendChart({
	days = 30,
	className,
}: BehaviorTrendChartProps) {
	const [data, setData] = useState<DailyBehavior[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		invoke<DailyBehavior[]>("get_user_behavior_trend", { days })
			.then((rows) => {
				if (cancelled) return;
				setData(rows ?? []);
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
	}, [days]);

	const series = useMemo(
		() => [
			{
				name: "Productive",
				data: data.map((d) => d.productiveMinutes),
			},
			{
				name: "Distracting",
				data: data.map((d) => d.distractingMinutes),
			},
		],
		[data],
	);

	const categories = useMemo(
		() => data.map((d) => dayjs(d.date).format("MMM D")),
		[data],
	);

	const options = useMemo<ApexOptions>(
		() => ({
			chart: {
				type: "area",
				height: 320,
				stacked: true,
				background: "transparent",
				toolbar: { show: false },
				fontFamily: FONT,
				animations: { enabled: true, easing: "easeout", speed: 700 },
			},
			colors: [COLORS.sage, COLORS.terracotta],
			dataLabels: { enabled: false },
			stroke: {
				curve: "smooth",
				width: [2, 2],
				colors: [COLORS.sage, COLORS.terracotta],
			},
			fill: {
				type: "gradient",
				gradient: {
					shadeIntensity: 1,
					opacityFrom: 0.45,
					opacityTo: 0.08,
					stops: [0, 90, 100],
				},
			},
			markers: {
				size: 0,
				strokeColors: [COLORS.sage, COLORS.terracotta],
				hover: { size: 4 },
			},
			grid: {
				borderColor: COLORS.grid,
				strokeDashArray: 4,
				padding: { left: -4, right: 4 },
			},
			xaxis: {
				type: "category",
				categories,
				tickAmount: days > 30 ? "dataPoints" : undefined,
				labels: {
					rotate: -45,
					hideOverlappingLabels: true,
					style: {
						colors: COLORS.mutedInk,
						fontSize: "11px",
						fontFamily: FONT,
					},
				},
				axisBorder: { show: false },
				axisTicks: { show: false },
				tooltip: { enabled: false },
			},
			yaxis: {
				min: 0,
				labels: {
					style: { colors: COLORS.ink, fontSize: "12px", fontFamily: FONT },
					formatter: (value: number) => `${Math.round(value)}m`,
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
				x: {
					formatter: (val: number) => {
						const raw = categories[val];
						const date = data[val]?.date;
						return raw ? `${raw} · ${dayjs(date).format("YYYY")}` : "";
					},
				},
				y: {
					formatter: (value: number) => `${value.toFixed(1)} min`,
				},
			},
			legend: {
				position: "top",
				horizontalAlign: "right",
				labels: { colors: COLORS.ink },
				fontFamily: FONT,
				markers: { shape: "circle" },
			},
			noData: {
				text: "A quiet month — nothing tracked yet",
				style: { colors: [COLORS.mutedInk], fontFamily: FONT },
			},
		}),
		[categories, data, days],
	);

	return (
		<section
			className={cn("rounded-3xl border p-5 sm:p-6", className)}
			style={{
				backgroundColor: COLORS.parchment,
				borderColor: "rgba(92, 75, 58, 0.16)",
				boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
			}}
		>
			<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2
						className={cn("buddha-heading text-base")}
						style={{ color: COLORS.ink }}
					>
						Your Behavior Trend
					</h2>
					<p
						className="mt-1 text-xs"
						style={{ color: COLORS.mutedInk, fontFamily: FONT }}
					>
						The balance of the past {days} days, minute by minute
					</p>
				</div>
			</div>

			{error ? (
				<p
					className="py-10 text-center text-sm text-red-800/70"
					style={{ fontFamily: FONT }}
				>
					Could not read the behavior trend: {error}
				</p>
			) : loading && data.length === 0 ? (
				<div
					className="flex h-72 items-center justify-center text-sm"
					style={{ color: COLORS.mutedInk, fontFamily: FONT }}
				>
					Sitting with the data…
				</div>
			) : (
				<ApexChart options={options} series={series} type="area" height={320} />
			)}
		</section>
	);
}
