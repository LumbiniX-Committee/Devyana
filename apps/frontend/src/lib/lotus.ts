export interface LotusOptions {
	/** Petal stroke color. Defaults to a muted terracotta. */
	stroke?: string;
	/** Stroke opacity, 0–1. Defaults to a faint watermark (0.16). */
	opacity?: number;
	/** Tile size in px. Defaults to 128. */
	size?: number;
}

function dataUri(svg: string): string {
	return `data:image/svg+xml;base64,${btoa(svg.trim())}`;
}

/** A radial lotus / mandala in two petal rings, drawn on a transparent canvas
 *  so it can tile as a `background-image` on top of the rice-paper palette. */
function lotusSvg(stroke: string, opacity: number, size: number): string {
	const rosaceOf = (petal: string, petals: number) =>
		Array.from({ length: petals }, (_, i) => {
			const angle = (i * 360) / petals;
			return `<use href="#${petal}" transform="rotate(${angle} 24 24)"/>`;
		}).join("");

	return dataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  <defs>
    <path id="petalOuter" d="M24 5 C 26 17, 31 29, 24 33 C 17 29, 22 17, 24 5 Z"/>
    <path id="petalInner" d="M24 16 C 25.6 24, 28 30, 24 34 C 20 30, 22.4 24, 24 16 Z"/>
  </defs>
  <g fill="none" stroke="${stroke}" stroke-width="0.6" opacity="${opacity}">
    ${rosaceOf("petalOuter", 8)}
    ${rosaceOf("petalInner", 8)}
    <circle cx="24" cy="24" r="1.6" fill="${stroke}" opacity="${opacity + 0.3}"/>
  </g>
</svg>`);
}

/**
 * Returns a `background-image` value (data URI of a tiled lotus motif) suited
 * for parchment surfaces. Wrap in CSS `background-image: repeat` is left to the
 * caller via `backgroundRepeat: "repeat"`.
 */
export function lotusBackground(options: LotusOptions = {}): string {
	const { stroke = "#C17A5A", opacity = 0.16, size = 128 } = options;
	return `url("${lotusSvg(stroke, opacity, size)}")`;
}

/** A fixed-size lotus mark used as an inline decorative watermark / icon. */
export function lotusMark(options: LotusOptions = {}): {
	backgroundImage: string;
	backgroundSize: string;
	backgroundRepeat: string;
	backgroundPosition: string;
} {
	const { stroke = "#C17A5A", opacity = 0.5, size = 40 } = options;
	return {
		backgroundImage: `url("${lotusSvg(stroke, opacity, size)}")`,
		backgroundSize: `${size}px`,
		backgroundPosition: "center",
		backgroundRepeat: "no-repeat",
	};
}
