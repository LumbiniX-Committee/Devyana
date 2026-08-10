import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import { Loader2 } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { cn } from "../../../lib/utils";
import {
	defaultForNegativeCategory,
	type NegativeCardDefault,
} from "./defaultNegativeCards";
import "./negativeCards.css";

/** One negative bucket as predicted & aggregated by the Intelligence Layer. */
interface NegativeWorkItem {
	category: string;
	totalMinutes: number;
	sessionCount: number;
	description: string;
}

function formatMinutes(value: number): string {
	const minutes = Math.round(Number(value) || 0);
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** SVG filter defs behind the torn-parchment edge of every card. */
const RaggedFilters = () => (
	<svg
		aria-hidden="true"
		focusable="false"
		style={{
			position: "absolute",
			width: 0,
			height: 0,
			pointerEvents: "none",
			overflow: "hidden",
		}}
	>
		<defs>
			<filter
				id="ragged-edge"
				x="-10%"
				y="-10%"
				width="120%"
				height="120%"
				filterUnits="objectBoundingBox"
			>
				<feTurbulence
					type="fractalNoise"
					baseFrequency="0.02"
					numOctaves="3"
					seed="7"
					result="noise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="10"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
			<filter
				id="ragged-edge-2"
				x="-10%"
				y="-10%"
				width="120%"
				height="120%"
				filterUnits="objectBoundingBox"
			>
				<feTurbulence
					type="fractalNoise"
					baseFrequency="0.035"
					numOctaves="2"
					seed="19"
					result="noise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="14"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
		</defs>
	</svg>
);

// A small vajra/dorje-inspired divider used on the front face.
const VajraDivider = ({ className = "" }: { className?: string }) => (
	<svg
		viewBox="0 0 120 16"
		fill="none"
		stroke="currentColor"
		strokeWidth="1"
		strokeLinecap="round"
		className={className}
		aria-hidden="true"
	>
		<path d="M10 8h35" />
		<path d="M75 8h35" />
		<path d="M52 8h16" />
		<path d="M48 4l4 4-4 4M72 4l-4 4 4 4" />
		<circle cx="60" cy="8" r="2.3" />
		<path d="M50 6l-2-2M50 10l-2 2M70 6l2-2M70 10l2 2" opacity="0.7" />
		<circle cx="6" cy="8" r="1" fill="currentColor" />
		<circle cx="114" cy="8" r="1" fill="currentColor" />
	</svg>
);

// Endless-knot inspired footer glyph.
const FooterGlyph = ({ className = "" }: { className?: string }) => (
	<svg
		viewBox="0 0 64 64"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
		aria-hidden="true"
	>
		<path d="M20 20h24v24H20z" />
		<path d="M14 26l12 12M50 26L38 38M14 38l12-12M50 38L38 26" />
		<circle cx="32" cy="32" r="3" />
	</svg>
);

interface NegativeCardProps {
	card: NegativeCardDefault;
	category: string;
	totalMinutes: number;
	sessionCount: number;
	filterId: string;
	onReveal: (category: string) => void;
}

/** A single torn-parchment "Terma" scroll fragment — a flip card. */
function NegativeCard({
	card,
	category,
	totalMinutes,
	sessionCount,
	filterId,
	onReveal,
}: NegativeCardProps) {
	const [flipped, setFlipped] = useState(false);
	const toggle = useCallback(() => setFlipped((f) => !f), []);
	const onKey = useCallback(
		(e: ReactKeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				toggle();
			}
		},
		[toggle],
	);

	const Icon = card.Icon;
	const filterStyle = { filter: `url(#${filterId})` };

	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements: a <button> cannot nest the back-face CTA button, so the flip card keeps a keyboard-accessible role. */}
			<div
				className="kd-card-perspective"
				role="button"
				tabIndex={0}
				aria-pressed={flipped}
				aria-label={`Negative work: ${card.front}. Press to reveal the correction path.`}
				onClick={toggle}
				onKeyDown={onKey}
			>
				<div className={cn("kd-card-inner", flipped && "is-flipped")}>
					{/* FRONT FACE — filtered parchment silhouette + crisp content layer */}
					<div className="kd-card-face kd-card-front">
						<div
							className="kd-parchment kd-parchment--front"
							style={filterStyle}
							aria-hidden="true"
						/>
						<div className="kd-face-content">
							<div className="kd-top-label">Negative Work</div>

							<div className="kd-icon-ring" aria-hidden="true">
								<span className="kd-icon-ring__disc">
									<Icon className="kd-icon-ring__disc" />
								</span>
							</div>

							<div>
								<h3 className="kd-front-title">{card.front}</h3>
								<div className="kd-divider">
									<VajraDivider className="kd-vajra" />
								</div>
							</div>
						</div>
					</div>

					{/* BACK FACE */}
					<div className="kd-card-face kd-card-back">
						<div
							className="kd-parchment kd-parchment--back"
							style={filterStyle}
							aria-hidden="true"
						/>
						<div className="kd-face-content">
							<div className="kd-top-label kd-top-label--back">
								The Path to Correction
							</div>

							<div>
								<h4 className="kd-back-title">{card.pathTitle}</h4>
								<p className="kd-back-desc">{card.lesson}</p>
							</div>

							<div>
								<p className="kd-back-meta">
									{formatMinutes(totalMinutes)} · {sessionCount}{" "}
									{sessionCount === 1 ? "session" : "sessions"}
								</p>
								<button
									type="button"
									className="kd-cta"
									onClick={(e) => {
										e.stopPropagation();
										onReveal(category);
									}}
								>
									How to correct?
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

interface NegativeCardsProps {
	className?: string;
	/** Override the Intelligence Layer source (used by the debug harness). */
	predictions?: NegativeWorkItem[];
}

/**
 * Negative Works, cast as a wall of torn-parchment flip cards.
 *
 * The negatives shown here come **exclusively** from the Intelligence Layer:
 * the week's unwholesome buckets are fetched via `get_negative_works`, and
 * each prediction is matched against the stored default objects in
 * `defaultNegativeCards.tsx` — which are retrieved from that catalog and only
 * composited into a card when the model actually named the burden.
 */
export default function NegativeCards({
	className,
	predictions,
}: NegativeCardsProps) {
	const navigate = useNavigate();
	const [items, setItems] = useState<NegativeWorkItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const range = useMemo(() => {
		const end = dayjs();
		const start = end.subtract(6, "day");
		return {
			startDate: start.format("YYYY-MM-DD"),
			endDate: end.format("YYYY-MM-DD"),
		};
	}, []);

	useEffect(() => {
		if (predictions) {
			setItems(predictions);
			setLoading(false);
			setError(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		invoke<NegativeWorkItem[]>("get_negative_works", {
			startDate: range.startDate,
			endDate: range.endDate,
		})
			.then((rows) => {
				if (cancelled) return;
				setItems(rows ?? []);
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
	}, [predictions, range]);

	// Deterministically alternate the two tear patterns per card (stable).
	const filters = useMemo(
		() =>
			items.map((_, idx) => {
				const base = idx % 2 === 0 ? "ragged-edge" : "ragged-edge-2";
				return [1, 2, 5].includes(idx)
					? base === "ragged-edge"
						? "ragged-edge-2"
						: "ragged-edge"
					: base;
			}),
		[items],
	);

	const reveal = useCallback(
		(category: string) =>
			navigate(`/negative-works?category=${encodeURIComponent(category)}`),
		[navigate],
	);

	const cards = useMemo(
		() =>
			items.map((item, idx) => ({
				card: defaultForNegativeCategory(item.category),
				category: item.category,
				totalMinutes: item.totalMinutes,
				sessionCount: item.sessionCount,
				filterId: filters[idx],
			})),
		[items, filters],
	);

	return (
		<section className={cn("kd-debt-shell w-full", className)}>
			<RaggedFilters />

			<div className="kd-container">
				<header className="kd-header">
					<h1 className="kd-title">Karmic Debt</h1>
					<div className="kd-title-divider" aria-hidden="true" />
					<p className="kd-subtitle">
						The burdens the Intelligence Layer has named this week — and the
						paths that lift them.
					</p>
				</header>

				{error ? (
					<div className="kd-state">
						<p className="kd-state-title">The model is silent</p>
						<p className="kd-state-text">
							The Intelligence Layer could not be read: {error}
						</p>
					</div>
				) : loading && items.length === 0 ? (
					<div className="kd-state">
						<Loader2
							className="h-8 w-8 animate-spin"
							style={{ color: "#8b0000" }}
						/>
						<p className="kd-state-title">Reading the week…</p>
						<p className="kd-state-text">
							Awaiting the Intelligence Layer&apos;s verdict.
						</p>
					</div>
				) : items.length === 0 ? (
					<div className="kd-state">
						<p className="kd-state-title">A clear week</p>
						<p className="kd-state-text">
							The Intelligence Layer found no unwholesome work to correct. May
							it continue.
						</p>
					</div>
				) : (
					<div className="kd-grid">
						{cards.map(
							({ card, category, totalMinutes, sessionCount, filterId }) => (
								<NegativeCard
									key={`${category}:${filterId}`}
									card={card}
									category={category}
									totalMinutes={totalMinutes}
									sessionCount={sessionCount}
									filterId={filterId}
									onReveal={reveal}
								/>
							),
						)}
					</div>
				)}

				<footer className="kd-footer">
					<FooterGlyph className="kd-footer-glyph" />
				</footer>
			</div>
		</section>
	);
}
