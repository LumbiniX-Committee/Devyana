import dayjs from "dayjs";
import { lazy, Suspense, useEffect } from "react";

import { DesktopTrackingStatusChip } from "../components/DesktopTracking";
import ProductivityGraph from "../components/ProductivityGraph";
import TaskPanel from "../components/TaskPanel";
import { lotusBackground } from "../lib/lotus";

const BehaviorTrendChart = lazy(
	() => import("../components/charts/BehaviorTrendChart"),
);
const HourlyProductivityChart = lazy(
	() => import("../components/charts/HourlyProductivityChart"),
);

const INK = "var(--ink)";
const MUTED = "var(--muted-ink)";

function ChartFallback() {
	return (
		<div
			className="flex h-72 flex-col items-center justify-center gap-3 rounded-3xl border text-sm"
			style={{
				backgroundColor: "var(--surface)",
				borderColor: "rgba(92, 75, 58, 0.16)",
				color: MUTED,
			}}
		>
			<div
				className="h-16 w-16"
				style={{
					backgroundImage: lotusBackground({
						stroke: "#8B9A6E",
						opacity: 0.45,
						size: 56,
					}),
				}}
			/>
			<p style={{ fontFamily: '"Poppins", sans-serif' }}>
				Sitting with the data…
			</p>
		</div>
	);
}

export default function DashboardContent() {
	useEffect(() => {
		document.body.setAttribute("data-buddha-theme", "");
		return () => document.body.removeAttribute("data-buddha-theme");
	}, []);

	const name =
		(typeof window !== "undefined" && localStorage.getItem("vinaya_name")) ||
		"friend";

	return (
		<div
			className="relative min-h-screen w-full"
			style={{
				backgroundColor: "var(--page)",
				backgroundImage: lotusBackground({
					stroke: "#C17A5A",
					opacity: 0.07,
					size: 140,
				}),
				backgroundAttachment: "fixed",
			}}
		>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-6">
				<header className="flex flex-wrap items-center justify-between gap-3 pb-1">
					<div className="flex items-center gap-3">
						<div
							className="grid h-11 w-11 place-items-center rounded-full"
							style={{
								backgroundImage: lotusBackground({
									stroke: "#8B9A6E",
									opacity: 0.85,
									size: 44,
								}),
								backgroundColor: "var(--surface)",
								border: "1px solid rgba(92, 75, 58, 0.18)",
							}}
							aria-hidden
						/>
						<div>
							<h1
								className="buddha-heading text-2xl leading-tight"
								style={{ color: INK }}
							>
								Vinaya
							</h1>
							<p className="text-xs" style={{ color: MUTED }}>
								Welcome back, {name} — may this day unfold with ease.
							</p>
						</div>
					</div>
					<span className="flex items-center gap-2">
						<DesktopTrackingStatusChip />
						<span
							className="text-xs"
							style={{ color: MUTED, fontFamily: '"Poppins", sans-serif' }}
						>
							{dayjs().format("dddd, D MMMM YYYY")}
						</span>
					</span>
				</header>

				<div className="flex flex-col gap-6">
					<Suspense fallback={<ChartFallback />}>
						<BehaviorTrendChart days={30} />
					</Suspense>

					<Suspense fallback={<ChartFallback />}>
						<HourlyProductivityChart />
					</Suspense>

					<section className="flex flex-col gap-3">
						<div className="flex items-baseline justify-between">
							<h2 className="buddha-heading text-base" style={{ color: INK }}>
								Productivity Garden
							</h2>
							<span
								className="text-xs"
								style={{ color: MUTED, fontFamily: '"Poppins", sans-serif' }}
							>
								Your focus, day by day
							</span>
						</div>
						<ProductivityGraph />
					</section>

					<section className="flex flex-col gap-3">
						<div className="flex items-baseline justify-between">
							<h2 className="buddha-heading text-base" style={{ color: INK }}>
								Tasks
							</h2>
							<span
								className="text-xs"
								style={{ color: MUTED, fontFamily: '"Poppins", sans-serif' }}
							>
								Small vows, kept one by one
							</span>
						</div>
						<TaskPanel />
					</section>

					<footer
						className="pt-2 pb-4 text-center text-xs"
						style={{ color: MUTED, fontFamily: '"Poppins", sans-serif' }}
					>
						&ldquo;Be a lamp unto yourself.&rdquo; — the Buddha
					</footer>
				</div>
			</div>
		</div>
	);
}
