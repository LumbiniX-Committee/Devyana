import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { Switch } from "./Switch";

const INK = "var(--ink)";
const MUTED = "var(--muted-ink)";
const SAGE = "var(--sage)";
const CLAY = "var(--clay)";

/**
 * Mirrors the backend's `desktop_tracking_status` toggle: resolves the current
 * value on mount and stays live via the Tauri event.
 */
function useDesktopTracking() {
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let disposed = false;
		let unlisten: (() => void) | undefined;

		void (async () => {
			try {
				const current = await invoke<boolean>("get_desktop_tracking_status");
				if (!disposed) setEnabled(current);
			} catch (error) {
				console.error("Failed to load desktop tracking status:", error);
			}
			try {
				unlisten = await listen<boolean>("desktop_tracking_status", (event) => {
					if (!disposed) setEnabled(event.payload);
				});
			} catch (error) {
				console.error("Failed to subscribe to desktop tracking status:", error);
			}
		})();

		return () => {
			disposed = true;
			unlisten?.();
		};
	}, []);

	const toggle = useCallback(async () => {
		if (enabled === null || busy) return;
		setBusy(true);
		try {
			const next = await invoke<boolean>("toggle_desktop_tracking", {
				enabled: !enabled,
			});
			setEnabled(next);
		} catch (error) {
			console.error("Failed to toggle desktop tracking:", error);
		} finally {
			setBusy(false);
		}
	}, [busy, enabled]);

	return { enabled, busy, toggle };
}

/** Small status pill for the dashboard header. */
export function DesktopTrackingStatusChip() {
	const { enabled } = useDesktopTracking();
	if (enabled === null) return null;

	const active = enabled === true;
	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
			style={{
				borderColor: active
					? "rgba(139, 154, 110, 0.45)"
					: "rgba(184, 92, 74, 0.45)",
				backgroundColor: active
					? "rgba(139, 154, 110, 0.12)"
					: "rgba(184, 92, 74, 0.10)",
				color: active ? "var(--sage)" : "var(--clay)",
			}}
			title={
				active
					? "Desktop app usage is being tracked"
					: "Desktop app usage tracking is paused"
			}
		>
			<span
				className="h-1.5 w-1.5 rounded-full"
				style={{ backgroundColor: active ? SAGE : CLAY }}
			/>
			{active ? "Desktop tracking active" : "Desktop tracking paused"}
		</span>
	);
}

/** Labelled on/off switch for the Settings page. */
export function DesktopTrackingToggle() {
	const { enabled, busy, toggle } = useDesktopTracking();
	const checked = enabled === true;

	return (
		<div
			className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
			style={{
				borderColor: "var(--border-soft)",
				backgroundColor: "var(--row)",
			}}
		>
			<div className="min-w-0">
				<p className="text-sm font-medium" style={{ color: INK }}>
					Desktop application tracking
				</p>
				<p className="mt-0.5 text-xs" style={{ color: MUTED }}>
					Track time in native apps so they appear in sessions and insights.
				</p>
			</div>
			<Switch
				checked={checked}
				onCheckedChange={() => void toggle()}
				disabled={enabled === null || busy}
				aria-label="Toggle desktop application tracking"
			/>
		</div>
	);
}
