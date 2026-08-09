import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";

export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.3;
export const FONT_SCALE_STEP = 0.05;

interface PreferencesState {
	theme: ThemePreference;
	fontScale: number;
	remindersEnabled: boolean;
	weeklyReflectionEnabled: boolean;
	negativeAlertsEnabled: boolean;
	setTheme: (theme: ThemePreference) => void;
	setFontScale: (scale: number) => void;
	incrementFontScale: () => void;
	decrementFontScale: () => void;
	resetFontScale: () => void;
	setRemindersEnabled: (value: boolean) => void;
	setWeeklyReflectionEnabled: (value: boolean) => void;
	setNegativeAlertsEnabled: (value: boolean) => void;
}

const clampFontScale = (scale: number) =>
	Math.min(
		MAX_FONT_SCALE,
		Math.max(MIN_FONT_SCALE, Math.round(scale * 100) / 100),
	);

export const FONT_SCALE_STORAGE_KEY = "vinaya_font_scale";
export const THEME_STORAGE_KEY = "vinaya_theme";

export const usePreferences = create<PreferencesState>()(
	persist(
		(set) => ({
			theme: "system",
			fontScale: 1,
			remindersEnabled: true,
			weeklyReflectionEnabled: true,
			negativeAlertsEnabled: false,
			setTheme: (theme) => set({ theme }),
			setFontScale: (scale) => set({ fontScale: clampFontScale(scale) }),
			incrementFontScale: () =>
				set((state) => ({
					fontScale: clampFontScale(state.fontScale + FONT_SCALE_STEP),
				})),
			decrementFontScale: () =>
				set((state) => ({
					fontScale: clampFontScale(state.fontScale - FONT_SCALE_STEP),
				})),
			resetFontScale: () => set({ fontScale: 1 }),
			setRemindersEnabled: (value) => set({ remindersEnabled: value }),
			setWeeklyReflectionEnabled: (value) =>
				set({ weeklyReflectionEnabled: value }),
			setNegativeAlertsEnabled: (value) =>
				set({ negativeAlertsEnabled: value }),
		}),
		{
			name: "vinaya_preferences",
			partialize: (state) => ({
				theme: state.theme,
				fontScale: state.fontScale,
				remindersEnabled: state.remindersEnabled,
				weeklyReflectionEnabled: state.weeklyReflectionEnabled,
				negativeAlertsEnabled: state.negativeAlertsEnabled,
			}),
		},
	),
);

const darkMedia = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Resolves the effective theme for a stored preference and toggles the
 * `dark` class on `<html>` exactly as Tailwind's dark variant expects. */
export function applyTheme(theme: ThemePreference) {
	const isDark =
		theme === "dark" || (theme === "system" && darkMedia().matches);
	document.documentElement.classList.toggle("dark", isDark);
	document.documentElement.setAttribute("data-theme", theme);
}

/** Applies the stored font scale by scaling the root font size so every
 * `rem`-based Tailwind sizing moves in lockstep. */
export function applyFontScale(scale: number) {
	const rootFontSize = 16 * clampFontScale(scale);
	document.documentElement.style.setProperty(
		"--app-font-size",
		`${rootFontSize}px`,
	);
	document.documentElement.style.fontSize = `${rootFontSize}px`;
}
