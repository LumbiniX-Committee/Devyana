import type { ComponentType } from "react";

/**
 * Default card catalog for the Negative Works flip cards.
 *
 * These defaults are intentionally written as plain data objects (one per
 * burden the Intelligence Layer can name) and are **not** rendered on their
 * own. The Negative Cards section fetches the week's negatives exclusively
 * from the Intelligence Layer (`get_negative_works`), looks each predicted
 * category up in this catalog, and only then brings the matching default
 * object to the UI — so the cards always reflect the model's prediction.
 */

const iconProps = {
	viewBox: "0 0 64 64",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.6,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	width: "100%",
	height: "100%",
} as const;

type CardIcon = ComponentType<{ className?: string }>;

// 1. Doomscroll / feed habit — Cloud
const CloudIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<path d="M18 42c-5 0-9-3.6-9-8.4 0-4.4 3.4-8 8-8.4C18.6 19.4 24 15 30.5 15c7 0 12.7 5.1 13.4 11.7 4.7.6 8.1 4.4 8.1 9C52 40.4 47.6 44 42 44H18z" />
		<path
			d="M20 50c1.5-1.4 3-1.4 4.5 0M30 52c1.5-1.4 3-1.4 4.5 0M40 50c1.5-1.4 3-1.4 4.5 0"
			opacity="0.7"
		/>
	</svg>
);

// 2. Time wasted / endless replay — Hourglass
const HourglassIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<path d="M20 10h24M20 54h24" />
		<path d="M22 10c0 10 20 12 20 22s-20 12-20 22" />
		<path d="M42 10c0 10-20 12-20 22s20 12 20 22" />
		<path d="M27 22c2 2 8 2 10 0M27 42c2-2 8-2 10 0" opacity="0.7" />
		<circle cx="32" cy="32" r="1.2" fill="currentColor" />
	</svg>
);

// 3. Compulsive touch / scrolling without a task — Ripple / Still Pool
const RippleIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<ellipse cx="32" cy="42" rx="22" ry="4" />
		<ellipse cx="32" cy="42" rx="15" ry="2.7" opacity="0.75" />
		<ellipse cx="32" cy="42" rx="7" ry="1.5" opacity="0.55" />
		<path d="M32 12l-3 12h6z" />
		<path d="M32 24v6" opacity="0.7" />
	</svg>
);

// 4. Comparing yourself to strangers — Inner Mirror
const MirrorIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<ellipse cx="32" cy="26" rx="14" ry="18" />
		<path d="M32 44v10M24 54h16" />
		<path d="M24 22c2-4 6-6 10-6" opacity="0.7" />
		<path d="M26 28c1 3 4 5 8 5" opacity="0.55" />
	</svg>
);

// 6. Feeling through a screen — Awakened Eye / Lotus
const EyeLotusIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<path d="M8 32c6-10 16-15 24-15s18 5 24 15c-6 10-16 15-24 15S14 42 8 32z" />
		<circle cx="32" cy="32" r="6" />
		<circle cx="32" cy="32" r="2" fill="currentColor" />
		<path d="M32 12v-4M20 15l-2-4M44 15l2-4" opacity="0.65" />
	</svg>
);

// Procrastination — Mountain
const MountainIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<path d="M6 50l14-22 8 12 6-9 14 19H6z" />
		<path d="M20 28l-5 8M34 31l-4 6" opacity="0.6" />
		<circle cx="46" cy="16" r="3" />
		<path
			d="M46 20v2M42 18h-2M50 18h2M43.5 14.5l-1.4-1.4M48.5 14.5l1.4-1.4"
			opacity="0.7"
		/>
	</svg>
);

// 7. Short-form dopamine hits — Bolt
const BoltIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<path d="M34 8L18 36h12l-4 20 18-30H32l2-18z" />
	</svg>
);

// 8. One more round / one more match — Controller
const ControllerIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<rect x="6" y="22" width="52" height="20" rx="10" />
		<path d="M22 30v4M20 32h4" />
		<circle cx="44" cy="30" r="1.5" fill="currentColor" />
		<circle cx="48" cy="34" r="1.5" fill="currentColor" />
		<path d="M12 30h2M14 32v2" opacity="0" />
	</svg>
);

// 9. Chance and risk — Dice
const DiceIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<rect x="14" y="14" width="36" height="36" rx="6" />
		<circle cx="26" cy="26" r="2" fill="currentColor" />
		<circle cx="38" cy="32" r="2" fill="currentColor" />
		<circle cx="26" cy="38" r="2" fill="currentColor" />
		<circle cx="38" cy="26" r="2" fill="currentColor" />
		<circle cx="26" cy="32" r="2" fill="currentColor" />
		<circle cx="38" cy="38" r="2" fill="currentColor" />
	</svg>
);

// 10. Watching instead of living — Play / Screen
const PlayScreenIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<rect x="8" y="12" width="48" height="34" rx="5" />
		<path d="M8 50h48" />
		<path d="M26 22l12 8-12 8z" />
	</svg>
);

// 11. Buying to feel better — Shopping Bag
const BagIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<path d="M18 22h28l-3 30H21l-3-30z" />
		<path d="M24 22v-6a8 8 0 0 1 16 0v6" />
		<path d="M24 30c-2 0-3-2-1-3M40 30c2 0 3-2 1-3" opacity="0.7" />
	</svg>
);

// 12. Generic burden — the still pool again, marked generic.
const GenericIcon: CardIcon = () => (
	<svg {...iconProps} aria-hidden="true">
		<circle cx="32" cy="20" r="9" />
		<path d="M27 18c2-2 5-3 8-2M29 25c2 1 5 1 7-1" opacity="0.6" />
		<path d="M16 44c4-6 8-8 16-8s12 2 16 8v12H16V44z" />
	</svg>
);

export interface NegativeCardDefault {
	/** Canonical lookup key — normalized Intelligence Layer category. */
	key: string;
	/** Label shown on the front face of the flip card. */
	front: string;
	/** Title of the correction path revealed on the back face. */
	pathTitle: string;
	/** The correction path shown on the back face. */
	lesson: string;
	/** Stroke icon rendered inside the front-face ring. */
	Icon: CardIcon;
}

/**
 * Stored default objects, one per burden the Intelligence Layer can predict
 * (both `ai_category` ids and free-form `bad_topic` labels are normalized to
 * the same snake_case keys). A generic object covers any future label the
 * model returns that is not yet in the catalog.
 */
export const NEGATIVE_CARD_DEFAULTS: NegativeCardDefault[] = [
	{
		key: "doomscrolling",
		front: "Doomscrolling",
		pathTitle: "The Middle Way",
		lesson: "Close the feed. Return to one meaningful thing.",
		Icon: CloudIcon,
	},
	{
		key: "procrastination",
		front: "Procrastination",
		pathTitle: "The First Step",
		lesson: "The smallest next step is the whole path.",
		Icon: MountainIcon,
	},
	{
		key: "dopamine_shorts",
		front: "Dopamine Shorts",
		pathTitle: "The Still Pool",
		lesson: "Return to long, slow attention.",
		Icon: BoltIcon,
	},
	{
		key: "social_media",
		front: "Social Media",
		pathTitle: "The Inner Mirror",
		lesson: "Honor your own path, not their highlights.",
		Icon: MirrorIcon,
	},
	{
		key: "gambling",
		front: "Gambling",
		pathTitle: "The Still Pool",
		lesson: "Urge is weather. Step away, breathe, decide later.",
		Icon: DiceIcon,
	},
	{
		key: "adult_content",
		front: "Adult Content",
		pathTitle: "The Awakened Sense",
		lesson: "Feel the world, screen-free. Urge passes.",
		Icon: EyeLotusIcon,
	},
	{
		key: "gaming",
		front: "Gaming",
		pathTitle: "The First Step",
		lesson: "Levels reset each dawn. Return to the task.",
		Icon: ControllerIcon,
	},
	{
		key: "streaming",
		front: "Streaming",
		pathTitle: "The Middle Way",
		lesson: "Pause the stream. Return to the room.",
		Icon: PlayScreenIcon,
	},
	{
		key: "entertainment",
		front: "Entertainment",
		pathTitle: "The Middle Way",
		lesson: "Watch the film, then lift the head.",
		Icon: HourglassIcon,
	},
	{
		key: "shopping",
		front: "Online Shopping",
		pathTitle: "The Path of Presence",
		lesson: "Ask what the purchase would really fill.",
		Icon: BagIcon,
	},
	{
		key: "browsing",
		front: "Mindless Browsing",
		pathTitle: "The Path of Presence",
		lesson: "Choose where each tap lands. One task beats a thousand tabs.",
		Icon: RippleIcon,
	},
	{
		key: "distracting",
		front: "Distracting Activity",
		pathTitle: "The First Step",
		lesson: "Start with the one task before you.",
		Icon: CloudIcon,
	},
	{
		key: "generic",
		front: "Negative Work",
		pathTitle: "The Path of Correction",
		lesson: "Meet the burden with kindness. Begin again.",
		Icon: GenericIcon,
	},
];

/** Keys the catalog keeps for negatives that map to a theme icon. */
const NEGATIVE_CARD_INDEX: Record<string, NegativeCardDefault> =
	Object.fromEntries(NEGATIVE_CARD_DEFAULTS.map((card) => [card.key, card]));

/** Fallback used for any Intelligence Layer label not yet catalogued. */
const GENERIC_CARD = NEGATIVE_CARD_INDEX.generic;

/** Normalizes a predicted label ("Social Media", "social_media") → key. */
export function normalizeNegativeKey(category: string): string {
	return category
		.trim()
		.toLowerCase()
		.replace(/[-\s]+/g, "_")
		.replace(/[^a-z0-9_]/g, "");
}

/**
 * Retrieves the stored default object for an Intelligence Layer prediction.
 * Unknown labels still render — they always receive a humane generic card.
 */
export function defaultForNegativeCategory(
	category: string,
): NegativeCardDefault {
	const key = normalizeNegativeKey(category);
	return NEGATIVE_CARD_INDEX[key] ?? GENERIC_CARD;
}
