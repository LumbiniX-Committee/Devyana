import {
	BookOpen,
	Check,
	CircleDot,
	Flower2,
	HelpCircle,
	PlayCircle,
} from "lucide-react";
import { useEffect } from "react";
import type { LessonNode, PathwayData } from "./types";

const statusLabel = {
	completed: "Completed",
	available: "Available",
};

interface PathwayMapProps {
	pathway: PathwayData;
	selectedLessonId: string | null;
	onSelectLesson: (node: LessonNode) => void;
}

function NodeIcon({ node }: { node: LessonNode }) {
	if (node.status === "completed") {
		return <Check aria-hidden="true" size={22} strokeWidth={2.4} />;
	}

	if (node.type === "video")
		return <PlayCircle aria-hidden="true" size={21} strokeWidth={2.1} />;
	if (node.type === "quiz")
		return <HelpCircle aria-hidden="true" size={20} strokeWidth={2.1} />;
	return <BookOpen aria-hidden="true" size={20} strokeWidth={2.1} />;
}

export function PathwayMap({
	pathway,
	selectedLessonId,
	onSelectLesson,
}: PathwayMapProps) {
	const FONT = '"Poppins", sans-serif';
	const INK = "var(--ink)";
	const MUTED = "var(--muted-ink)";
	const SAGE = "var(--sage)";
	const TERRACOTTA = "var(--terracotta)";

	// Inject styles once
	useEffect(() => {
		const styleId = "pathway-map-styles";
		if (document.getElementById(styleId)) return;

		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = `
      .path-node-wrap { position: absolute; }
      .path-node { width: 56px; height: 56px; border-radius: 50%; border: 2px solid; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; }
      .path-node:hover { transform: scale(1.1); }
      .path-node-completed { border-color: #8B9A6E; }
      .path-node-available { border-color: #C17A5A; }
      .is-selected .path-node { transform: scale(1.15); }
      .node-pulse { border-radius: 50%; animation: pulse 2s infinite; }
      @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } }
      .path-node-wrap:hover [role="tooltip"], .path-node:focus + [role="tooltip"] { opacity: 1; visibility: visible; }
      .journey-path-shadow, .journey-path { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.05)); }
      .particle-one { animation: float 4s ease-in-out infinite; }
      .particle-two { animation: float 5s ease-in-out infinite 1s; }
      .particle-three { animation: float 6s ease-in-out infinite 2s; }
      @keyframes float { 0%, 100% { transform: translateY(0); opacity: 0.3; } 50% { transform: translateY(-8px); opacity: 0.6; } }
    `;
		document.head.appendChild(style);

		return () => {
			const el = document.getElementById(styleId);
			if (el) el.remove();
		};
	}, []);

	return (
		<section
			className="rounded-3xl border p-5 sm:p-6"
			style={{
				backgroundColor: "var(--surface)",
				borderColor: "rgba(92, 75, 58, 0.16)",
				boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)",
			}}
			aria-label={`${pathway.title} learning pathway`}
		>
			<div className="mb-6 flex flex-wrap items-start justify-between gap-3">
				<div>
					<p
						className="text-xs font-medium tracking-wide"
						style={{ color: MUTED, fontFamily: FONT }}
					>
						Structured study
					</p>
					<h2 className="mt-1 buddha-heading text-xl" style={{ color: INK }}>
						{pathway.title}
					</h2>
					<p
						className="mt-1 text-sm"
						style={{ color: MUTED, fontFamily: FONT }}
					>
						{pathway.description}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-4">
					<span
						className="flex items-center gap-1.5 text-xs"
						style={{ color: MUTED, fontFamily: FONT }}
					>
						<i
							className="legend-dot completed h-2 w-2 rounded-full"
							style={{ backgroundColor: SAGE }}
						/>
						Completed
					</span>
					<span
						className="flex items-center gap-1.5 text-xs"
						style={{ color: MUTED, fontFamily: FONT }}
					>
						<i
							className="legend-dot available h-2 w-2 rounded-full"
							style={{ backgroundColor: TERRACOTTA }}
						/>
						Available
					</span>
				</div>
			</div>

			<div className="relative" style={{ minHeight: "420px" }}>
				<div
					className="absolute inset-0 opacity-10"
					aria-hidden="true"
					style={{
						backgroundImage: `url("data:image/svg+xml;base64,${btoa(`
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <path id="petalOuter" d="M24 5 C 26 17, 31 29, 24 33 C 17 29, 22 17, 24 5 Z"/>
    <path id="petalInner" d="M24 16 C 25.6 24, 28 30, 24 34 C 20 30, 22.4 24, 24 16 Z"/>
  </defs>
  <g fill="none" stroke="#8B9A6E" stroke-width="0.5" opacity="0.6">
    ${Array.from({ length: 8 }, (_, i) => `<use href="#petalOuter" transform="rotate(${i * 45} 24 24)"/>`).join("")}
    ${Array.from({ length: 8 }, (_, i) => `<use href="#petalInner" transform="rotate(${i * 45} 24 24)"/>`).join("")}
    <circle cx="24" cy="24" r="1.6" fill="#8B9A6E" opacity="0.4"/>
  </g>
</svg>
`).trim()}")`,
						backgroundRepeat: "repeat",
					}}
				/>

				<svg
					className="absolute inset-0 w-full h-full"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<path
						className="journey-path-shadow"
						d="M 11 9 C 28 11 40 17 36 27 S 52 41 63 49 S 62 63 48 66 S 20 72 30 81 S 64 86 83 93"
						stroke="#E0D7C6"
						strokeWidth="3"
						fill="none"
						strokeLinecap="round"
						strokeLinejoin="round"
						opacity="0.5"
					/>
					<path
						className="journey-path"
						d="M 11 9 C 28 11 40 17 36 27 S 52 41 63 49 S 62 63 48 66 S 20 72 30 81 S 64 86 83 93"
						stroke="#E0D7C6"
						strokeWidth="2"
						fill="none"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeDasharray="6 4"
					/>
				</svg>

				<Flower2
					className="absolute top-2 left-2 h-8 w-8"
					aria-hidden="true"
					style={{ color: SAGE, opacity: 0.6 }}
				/>
				<CircleDot
					className="absolute bottom-2 right-2 h-8 w-8"
					aria-hidden="true"
					style={{ color: TERRACOTTA, opacity: 0.6 }}
				/>

				<span
					className="absolute path-particle particle-one h-1.5 w-1.5 rounded-full"
					style={{
						backgroundColor: SAGE,
						opacity: 0.4,
						top: "15%",
						left: "20%",
					}}
					aria-hidden="true"
				/>
				<span
					className="absolute path-particle particle-two h-1.5 w-1.5 rounded-full"
					style={{
						backgroundColor: TERRACOTTA,
						opacity: 0.4,
						top: "50%",
						left: "60%",
					}}
					aria-hidden="true"
				/>
				<span
					className="absolute path-particle particle-three h-1.5 w-1.5 rounded-full"
					style={{
						backgroundColor: "#D4A853",
						opacity: 0.4,
						top: "75%",
						left: "25%",
					}}
					aria-hidden="true"
				/>

				{pathway.nodes.map((node, index) => {
					const isSelected = selectedLessonId === node.id;
					const nodeStyle: React.CSSProperties = {
						left: `${node.position.x}%`,
						top: `${node.position.y}%`,
						transform: "translate(-50%, -50%)",
					};

					return (
						<div
							className={`path-node-wrap ${isSelected ? "is-selected" : ""}`}
							key={node.id}
							style={nodeStyle}
						>
							<button
								type="button"
								className={`path-node path-node-${node.status} ${isSelected ? "ring-2 ring-offset-2" : ""}`}
								data-testid={`pathway-node-${node.id}`}
								aria-label={`${node.title}. ${statusLabel[node.status]}. ${node.description}`}
								onClick={() => onSelectLesson(node)}
								style={{
									backgroundColor:
										node.status === "completed"
											? "rgba(139, 154, 110, 0.15)"
											: "rgba(193, 122, 90, 0.15)",
									borderColor: node.status === "completed" ? SAGE : TERRACOTTA,
									boxShadow: isSelected
										? `0 0 0 3px ${SAGE}40, 0 8px 24px rgba(60, 40, 20, 0.12)`
										: node.status === "available"
											? "0 4px 16px rgba(193, 122, 90, 0.2)"
											: "0 4px 16px rgba(60, 40, 20, 0.08)",
								}}
							>
								{node.status === "available" && (
									<span
										className="node-pulse absolute inset-0 rounded-full animate-pulse"
										style={{ backgroundColor: TERRACOTTA, opacity: 0.3 }}
										aria-hidden="true"
									/>
								)}
								<span className="relative flex items-center justify-center flex-col z-10">
									<span
										className="node-index text-[9px] font-medium"
										style={{ color: INK, fontFamily: FONT }}
										aria-hidden="true"
									>
										{String(index + 1).padStart(2, "0")}
									</span>
									<span className="node-icon mt-1">
										<NodeIcon node={node} />
									</span>
								</span>
							</button>

							<div
								id={`tooltip-${node.id}`}
								role="tooltip"
								className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-xl border bg-[#2B2116] px-3 py-2 text-left text-xs shadow-xl opacity-0 invisible transition-all duration-200 pointer-events-none z-20"
								style={{ borderColor: "#E0D7C6", fontFamily: FONT }}
							>
								<strong className="block text-white mb-1">{node.title}</strong>
								<span className="block text-[#D4A853] mb-1">
									{node.description}
								</span>
								<em className="block text-[#8B9A6E]">
									{statusLabel[node.status]}
								</em>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
