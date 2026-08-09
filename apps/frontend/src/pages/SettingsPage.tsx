import { invoke } from "@tauri-apps/api/core";
import {
	Download,
	Flower2,
	Minus,
	Monitor,
	Moon,
	Plus,
	RotateCcw,
	ShieldAlert,
	Sun,
	Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { DesktopTrackingToggle } from "../components/DesktopTracking";
import { Switch } from "../components/Switch";
import { lotusBackground } from "../lib/lotus";
import {
	MAX_FONT_SCALE,
	MIN_FONT_SCALE,
	type ThemePreference,
	usePreferences,
} from "../lib/preferences";

const INK = "var(--ink)";
const MUTED = "var(--muted-ink)";
const SAGE = "var(--sage)";
const TERRACOTTA = "var(--terracotta)";

function Section({
	title,
	icon,
	children,
}: {
	title: string;
	icon?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section
			className="rounded-3xl border p-5 sm:p-6"
			style={{
				backgroundColor: "var(--surface)",
				borderColor: "var(--border-card)",
				boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
			}}
		>
			<div className="mb-4 flex items-center gap-2">
				{icon}
				<h2 className="buddha-heading text-base" style={{ color: INK }}>
					{title}
				</h2>
			</div>
			{children}
		</section>
	);
}

function Row({
	title,
	description,
	control,
	destructive = false,
}: {
	title: string;
	description: string;
	control: ReactNode;
	destructive?: boolean;
}) {
	return (
		<div
			className="flex items-center justify-between gap-4 rounded-xl border p-3.5"
			style={{
				borderColor: "var(--border-soft)",
				backgroundColor: "var(--row)",
			}}
		>
			<div className="min-w-0">
				<p
					className="text-sm font-medium"
					style={{ color: destructive ? TERRACOTTA : INK }}
				>
					{title}
				</p>
				<p className="mt-0.5 text-xs leading-snug" style={{ color: MUTED }}>
					{description}
				</p>
			</div>
			{control}
		</div>
	);
}

const THEME_OPTIONS: {
	value: ThemePreference;
	label: string;
	icon: typeof Sun;
}[] = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
];

export default function SettingsPage() {
	const {
		theme,
		fontScale,
		remindersEnabled,
		weeklyReflectionEnabled,
		negativeAlertsEnabled,
		setTheme,
		incrementFontScale,
		decrementFontScale,
		resetFontScale,
		setRemindersEnabled,
		setWeeklyReflectionEnabled,
		setNegativeAlertsEnabled,
	} = usePreferences();

	const [exportBusy, setExportBusy] = useState(false);
	const [clearBusy, setClearBusy] = useState(false);

	useEffect(() => {
		document.body.setAttribute("data-buddha-theme", "");
		return () => document.body.removeAttribute("data-buddha-theme");
	}, []);

	const handleTheme = (value: ThemePreference) => {
		setTheme(value);
	};

	const handleExport = async () => {
		setExportBusy(true);
		try {
			const archive = await invoke<string>("export_data");
			const blob = new Blob([archive], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			const stamp = new Date().toISOString().slice(0, 19).split(":").join("-");
			a.href = url;
			a.download = `vinaya-export-${stamp}.json`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success("Your data archive has been downloaded");
		} catch (error) {
			console.error("Export failed:", error);
			toast.error("Could not export your data. Please try again.");
		} finally {
			setExportBusy(false);
		}
	};

	const handleClearAll = async () => {
		if (
			!window.confirm(
				"This permanently deletes every session, task, reminder, and your profile. This cannot be undone. Continue?",
			)
		) {
			return;
		}
		setClearBusy(true);
		try {
			await invoke("clear_all_data");
			[
				"user_profile_id",
				"vinaya_onboarded",
				"onboarding_completed",
				"vinaya_name",
				"vinaya_role",
				"vinaya_goal",
				"vinaya_gender",
				"vinaya_age",
			].forEach((key) => {
				localStorage.removeItem(key);
			});
			localStorage.removeItem("vinaya_preferences");
			toast.success("All data cleared");
			window.location.href = "/";
		} catch (error) {
			console.error("Clear failed:", error);
			toast.error("Could not clear your data. Please try again.");
		} finally {
			setClearBusy(false);
		}
	};

	const fontPercent = Math.round(fontScale * 100);

	return (
		<div
			className="relative min-h-screen w-full"
			style={{
				backgroundColor: "var(--page)",
				backgroundImage: lotusBackground({
					stroke: "var(--terracotta)",
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
								backgroundColor: "var(--surface)",
								border: "1px solid rgba(212, 168, 83, 0.18)",
							}}
							aria-hidden
						>
							<Flower2
								size={22}
								style={{ color: "#D4A853" }}
								aria-hidden="true"
							/>
						</div>
						<div>
							<h1
								className="buddha-heading text-2xl leading-tight"
								style={{ color: INK }}
							>
								Settings
							</h1>
							<p className="text-xs" style={{ color: MUTED }}>
								Adjust how Vinaya serves your practice.
							</p>
						</div>
					</div>
				</header>

				<div className="flex flex-col gap-4">
					<Section title="Tracking">
						<DesktopTrackingToggle />
					</Section>

					<Section title="Appearance">
						<div className="space-y-3">
							<Row
								title="Theme"
								description="Light, dark, or follow your system"
								control={
									<div
										className="flex shrink-0 rounded-full p-1"
										style={{
											backgroundColor: "var(--row)",
											border: "1px solid var(--border-soft)",
										}}
									>
										{THEME_OPTIONS.map((option) => {
											const active = theme === option.value;
											const Icon = option.icon;
											return (
												<button
													key={option.value}
													type="button"
													onClick={() => handleTheme(option.value)}
													className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
													style={{
														backgroundColor: active
															? "var(--sage)"
															: "transparent",
														color: active ? "#FFFFFF" : "var(--muted-ink)",
														boxShadow: active
															? "0 2px 6px rgba(0,0,0,0.15)"
															: undefined,
													}}
													aria-pressed={active}
												>
													<Icon
														size={13}
														strokeWidth={2.2}
														aria-hidden="true"
													/>
													{option.label}
												</button>
											);
										})}
									</div>
								}
							/>
							<Row
								title="Font Scale"
								description="Adjust text size globally"
								control={
									<div className="flex shrink-0 items-center gap-2">
										<button
											type="button"
											onClick={decrementFontScale}
											disabled={fontScale <= MIN_FONT_SCALE}
											className="grid h-9 w-9 place-items-center rounded-full border transition-colors hover:bg-[var(--row)] disabled:cursor-not-allowed disabled:opacity-40"
											style={{
												borderColor: "var(--hairline)",
												color: INK,
												background: "var(--surface)",
											}}
											aria-label="Decrease font size"
										>
											<Minus size={15} aria-hidden="true" />
										</button>
										<span
											className="w-12 text-center text-sm font-semibold tabular-nums"
											style={{ color: INK }}
										>
											{fontPercent}%
										</span>
										<button
											type="button"
											onClick={incrementFontScale}
											disabled={fontScale >= MAX_FONT_SCALE}
											className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
											style={{
												backgroundColor: "var(--sage)",
												color: "#FFFFFF",
												boxShadow: "0 2px 8px rgba(92, 75, 58, 0.2)",
											}}
											aria-label="Increase font size"
										>
											<Plus size={15} aria-hidden="true" />
										</button>
										<button
											type="button"
											onClick={resetFontScale}
											disabled={fontScale === 1}
											className="grid h-9 w-9 place-items-center rounded-full border transition-colors hover:bg-[var(--row)] disabled:cursor-not-allowed disabled:opacity-40"
											style={{ borderColor: "var(--hairline)", color: MUTED }}
											aria-label="Reset font size"
										>
											<RotateCcw size={14} aria-hidden="true" />
										</button>
									</div>
								}
							/>
						</div>
					</Section>

					<Section
						title="Notifications"
						icon={<ShieldAlert size={16} style={{ color: SAGE }} />}
					>
						<div className="space-y-3">
							<Row
								title="Mindful Reminders"
								description="Gentle nudges throughout the day"
								control={
									<Switch
										checked={remindersEnabled}
										onCheckedChange={setRemindersEnabled}
										aria-label="Toggle mindful reminders"
									/>
								}
							/>
							<Row
								title="Weekly Reflection"
								description="Sunday evening summary"
								control={
									<Switch
										checked={weeklyReflectionEnabled}
										onCheckedChange={setWeeklyReflectionEnabled}
										aria-label="Toggle weekly reflection"
									/>
								}
							/>
							<Row
								title="Negative Works Alerts"
								description="When unwholesome patterns exceed threshold"
								control={
									<Switch
										checked={negativeAlertsEnabled}
										onCheckedChange={setNegativeAlertsEnabled}
										aria-label="Toggle negative works alerts"
									/>
								}
							/>
						</div>
					</Section>

					<Section title="Data & Privacy">
						<div className="space-y-3">
							<Row
								title="Export My Data"
								description="Download a JSON archive of everything"
								control={
									<button
										type="button"
										disabled={exportBusy}
										onClick={() => void handleExport()}
										className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50"
										style={{
											backgroundColor: "var(--row)",
											border: "1px solid var(--border-soft)",
											color: INK,
										}}
									>
										<Download size={14} aria-hidden="true" />
										{exportBusy ? "Exporting…" : "Export"}
									</button>
								}
							/>
							<Row
								title="Clear All Data"
								description="Permanently delete everything"
								destructive
								control={
									<button
										type="button"
										disabled={clearBusy}
										onClick={() => void handleClearAll()}
										className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors hover:brightness-95 disabled:opacity-50"
										style={{
											backgroundColor: TERRACOTTA,
											color: "#FFFFFF",
										}}
									>
										<Trash2 size={14} aria-hidden="true" />
										{clearBusy ? "Clearing…" : "Clear"}
									</button>
								}
							/>
						</div>
					</Section>

					<Section title="About">
						<div
							className="space-y-2 text-sm"
							style={{ color: MUTED, fontFamily: '"Poppins", sans-serif' }}
						>
							<p>Vinaya</p>
							<p>Version 0.1.0 (Hackathon Build)</p>
							<p>Built with React, Tauri, and compassion</p>
						</div>
					</Section>
				</div>

				<footer
					className="pt-2 pb-4 text-center text-xs"
					style={{ color: MUTED, fontFamily: '"Poppins", sans-serif' }}
				>
					&ldquo;Your work is to discover your world and then with all your
					heart give yourself to it.&rdquo; — the Buddha
				</footer>
			</div>
		</div>
	);
}
