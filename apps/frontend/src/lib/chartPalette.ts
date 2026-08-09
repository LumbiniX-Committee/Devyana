import { usePreferences } from "./preferences";

export interface ChartPalette {
	ink: string;
	mutedInk: string;
	grid: string;
	sage: string;
	terracotta: string;
	gold: string;
	parchment: string;
	tooltipBg: string;
	boxBorder: string;
	plotBg: string;
}

const LIGHT: ChartPalette = {
	ink: "#5C4B3A",
	mutedInk: "#85705B",
	grid: "#E0D7C6",
	sage: "#8B9A6E",
	terracotta: "#C17A5A",
	gold: "#D4A853",
	parchment: "#FDF8F2",
	tooltipBg: "#2B2116",
	boxBorder: "rgba(92, 75, 58, 0.14)",
	plotBg: "rgba(255, 255, 255, 0.6)",
};

const DARK: ChartPalette = {
	ink: "#EFE6D4",
	mutedInk: "#B3A48C",
	grid: "rgba(244, 236, 222, 0.16)",
	sage: "#A4B488",
	terracotta: "#D18E6B",
	gold: "#D4A853",
	parchment: "#221A12",
	tooltipBg: "#2B2116",
	boxBorder: "rgba(244, 236, 222, 0.12)",
	plotBg: "rgba(255, 255, 255, 0.04)",
};

/** Resolves a literal color palette for the current effective theme so chart
 *  SVG internals (which can't use CSS variables) stay legible in dark mode. */
export function useChartPalette(): ChartPalette {
	const theme = usePreferences((state) => state.theme);
	const systemDark =
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-color-scheme: dark)").matches;
	const dark = theme === "dark" || (theme === "system" && systemDark);
	return dark ? DARK : LIGHT;
}
