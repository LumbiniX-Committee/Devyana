import { useEffect } from "react";
import NegativeCards from "../components/negative/negative-cards/NegativeCards";
import { lotusBackground } from "../lib/lotus";

const INK = "var(--ink)";
const MUTED = "var(--muted-ink)";

export default function NegativeWorksPage() {
	useEffect(() => {
		document.body.setAttribute("data-buddha-theme", "");
		return () => document.body.removeAttribute("data-buddha-theme");
	}, []);

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
									stroke: "#B85C4A",
									opacity: 0.85,
									size: 44,
								}),
								backgroundColor: "var(--surface)",
								border: "1px solid rgba(184, 92, 74, 0.18)",
							}}
							aria-hidden
						>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#B85C4A"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
								<line x1="12" y1="9" x2="12" y2="13" />
								<line x1="12" y1="17" x2="12.01" y2="17" />
							</svg>
						</div>
						<div>
							<h1
								className="buddha-heading text-2xl leading-tight"
								style={{ color: INK }}
							>
								Negative Works
							</h1>
							<p className="text-xs" style={{ color: MUTED }}>
								Acknowledge and transform unwholesome patterns.
							</p>
						</div>
					</div>
				</header>

				<NegativeCards />

				<footer
					className="pt-2 pb-4 text-center text-xs"
					style={{ color: MUTED, fontFamily: '"Poppins", sans-serif' }}
				>
					&ldquo;Just as a snake sheds its skin, we must shed our past over and
					over again.&rdquo; — the Buddha
				</footer>
			</div>
		</div>
	);
}
