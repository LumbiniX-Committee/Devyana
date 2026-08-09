import { useEffect } from "react";
import { lotusBackground } from "../lib/lotus";
import { DesktopTrackingToggle } from "../components/DesktopTracking";

const INK = "#5C4B3A";
const MUTED = "#85705B";
const SAGE = "#8B9A6E";
const TERRACOTTA = "#C17A5A";

export default function SettingsPage() {
	useEffect(() => {
		document.body.setAttribute("data-buddha-theme", "");
		return () => document.body.removeAttribute("data-buddha-theme");
	}, []);

	return (
		<div
			className="relative min-h-screen w-full"
			style={{
				backgroundColor: "#FBF7F0",
				backgroundImage: lotusBackground({
					stroke: "#D4A853",
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
									stroke: "#D4A853",
									opacity: 0.85,
									size: 44,
								}),
								backgroundColor: "#FDF8F2",
								border: "1px solid rgba(212, 168, 83, 0.18)",
							}}
							aria-hidden
						>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#D4A853"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<circle cx="12" cy="12" r="3" />
								<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
							</svg>
						</div>
						<div>
							<h1 className="buddha-heading text-2xl leading-tight" style={{ color: INK }}>
								Settings
							</h1>
							<p className="text-xs" style={{ color: MUTED }}>
								Adjust how Frocus serves your practice.
							</p>
						</div>
					</div>
				</header>

				<div className="flex flex-col gap-4">
					<section
						className="rounded-3xl border p-5 sm:p-6"
						style={{
							backgroundColor: "#FDF8F2",
							borderColor: "rgba(92, 75, 58, 0.16)",
							boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
						}}
					>
						<h2 className="buddha-heading text-base mb-4" style={{ color: INK }}>
							Tracking
						</h2>
						<DesktopTrackingToggle />
					</section>

					<section
						className="rounded-3xl border p-5 sm:p-6"
						style={{
							backgroundColor: "#FDF8F2",
							borderColor: "rgba(92, 75, 58, 0.16)",
							boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
						}}
					>
						<h2 className="buddha-heading text-base mb-4" style={{ color: INK }}>
							Appearance
						</h2>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="flex items-center justify-between rounded-xl border p-3"
								style={{ borderColor: "rgba(92, 75, 58, 0.12)", backgroundColor: "#FBF7F0" }}>
								<div>
									<p className="text-sm font-medium" style={{ color: INK }}>Theme</p>
									<p className="text-xs mt-0.5" style={{ color: MUTED }}>Light, dark, or system</p>
								</div>
								<button
									type="button"
									className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
									style={{ borderColor: SAGE, color: SAGE }}
								>
									System
								</button>
							</div>
							<div className="flex items-center justify-between rounded-xl border p-3"
								style={{ borderColor: "rgba(92, 75, 58, 0.12)", backgroundColor: "#FBF7F0" }}>
								<div>
									<p className="text-sm font-medium" style={{ color: INK }}>Font Scale</p>
									<p className="text-xs mt-0.5" style={{ color: MUTED }}>Adjust text size globally</p>
								</div>
								<div className="flex items-center gap-2">
									<button className="grid h-8 w-8 place-items-center rounded-full border text-sm"
										style={{ borderColor: "rgba(92, 75, 58, 0.2)", color: INK }}>-</button>
									<span className="w-10 text-center text-sm font-medium" style={{ color: INK }}>100%</span>
									<button className="grid h-8 w-8 place-items-center rounded-full border text-sm"
										style={{ borderColor: "rgba(92, 75, 58, 0.2)", color: INK }}>+</button>
								</div>
							</div>
						</div>
					</section>

					<section
						className="rounded-3xl border p-5 sm:p-6"
						style={{
							backgroundColor: "#FDF8F2",
							borderColor: "rgba(92, 75, 58, 0.16)",
							boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
						}}
					>
						<h2 className="buddha-heading text-base mb-4" style={{ color: INK }}>
							Notifications
						</h2>
						<div className="space-y-3">
							<label className="flex items-center justify-between cursor-pointer">
								<div>
									<p className="text-sm font-medium" style={{ color: INK }}>Mindful Reminders</p>
									<p className="text-xs mt-0.5" style={{ color: MUTED }}>Gentle nudges throughout the day</p>
								</div>
								<button
									type="button"
									role="switch"
									aria-checked={true}
									className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
									style={{ backgroundColor: SAGE }}
								>
									<span className="absolute top-0.5 left-[calc(100%-1.75rem)] h-5 w-5 rounded-full bg-white shadow-sm" />
								</button>
							</label>
							<label className="flex items-center justify-between cursor-pointer">
								<div>
									<p className="text-sm font-medium" style={{ color: INK }}>Weekly Reflection</p>
									<p className="text-xs mt-0.5" style={{ color: MUTED }}>Sunday evening summary</p>
								</div>
								<button
									type="button"
									role="switch"
									aria-checked={true}
									className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
									style={{ backgroundColor: SAGE }}
								>
									<span className="absolute top-0.5 left-[calc(100%-1.75rem)] h-5 w-5 rounded-full bg-white shadow-sm" />
								</button>
							</label>
							<label className="flex items-center justify-between cursor-pointer">
								<div>
									<p className="text-sm font-medium" style={{ color: INK }}>Negative Works Alerts</p>
									<p className="text-xs mt-0.5" style={{ color: MUTED }}>When unwholesome patterns exceed threshold</p>
								</div>
								<button
									type="button"
									role="switch"
									aria-checked={false}
									className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
									style={{ backgroundColor: "#E7DECE" }}
								>
									<span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm" />
								</button>
							</label>
						</div>
					</section>

					<section
						className="rounded-3xl border p-5 sm:p-6"
						style={{
							backgroundColor: "#FDF8F2",
							borderColor: "rgba(92, 75, 58, 0.16)",
							boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
						}}
					>
						<h2 className="buddha-heading text-base mb-4" style={{ color: INK }}>
							Data & Privacy
						</h2>
						<div className="space-y-3">
							<button
								type="button"
								className="w-full flex items-center justify-between rounded-xl border p-3 text-left transition-colors hover:bg-[#F2EADB]"
								style={{ borderColor: "rgba(92, 75, 58, 0.12)", backgroundColor: "#FBF7F0" }}
							>
								<div>
									<p className="text-sm font-medium" style={{ color: INK }}>Export My Data</p>
									<p className="text-xs mt-0.5" style={{ color: MUTED }}>Download a JSON archive</p>
								</div>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" aria-hidden="true">
									<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
									<polyline points="7 10 12 15 17 10" />
									<line x1="12" y1="15" x2="12" y2="3" />
								</svg>
							</button>
							<button
								type="button"
								className="w-full flex items-center justify-between rounded-xl border p-3 text-left transition-colors hover:bg-[#F2EADB]"
								style={{ borderColor: "rgba(92, 75, 58, 0.12)", backgroundColor: "#FBF7F0" }}
							>
								<div>
									<p className="text-sm font-medium" style={{ color: INK }}>Clear All Data</p>
									<p className="text-xs mt-0.5" style={{ color: MUTED }}>Permanently delete everything</p>
								</div>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TERRACOTTA} strokeWidth="2" aria-hidden="true">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								</svg>
							</button>
						</div>
					</section>

					<section
						className="rounded-3xl border p-5 sm:p-6"
						style={{
							backgroundColor: "#FDF8F2",
							borderColor: "rgba(92, 75, 58, 0.16)",
							boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
						}}
					>
						<h2 className="buddha-heading text-base mb-4" style={{ color: INK }}>
							About
						</h2>
						<div className="space-y-2 text-sm" style={{ color: MUTED, fontFamily: '"Georgia", serif' }}>
							<p>Frocus — Digital Vinaya Companion</p>
							<p>Version 0.1.0 (Hackathon Build)</p>
							<p>Built with React, Tauri, and compassion</p>
						</div>
					</section>
				</div>

				<footer
					className="pt-2 pb-4 text-center text-xs"
					style={{ color: MUTED, fontFamily: '"Georgia", serif' }}
				>
					&ldquo;Your work is to discover your world and then with all your heart give yourself to it.&rdquo; — the Buddha
				</footer>
			</div>
		</div>
	);
}