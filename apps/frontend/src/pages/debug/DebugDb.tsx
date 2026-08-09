import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

import { ActionButton, Card, DebugShell } from "./ui";

interface DebugSession {
	id: string;
	clientId: string;
	browserType: string;
	url: string;
	hostname: string;
	pathname: string;
	meta: Record<string, unknown>;
	durationMs: number;
	startedAt: number;
	endedAt: number;
	matchedRules: string[];
	primaryRuleId: string | null;
	tabId: number;
	aggregatedFrom: number;
	aiCategory: string | null;
	processedForGraph: number;
	recordedAt: string;
}

const CATEGORY_TONE: Record<string, string> = {
	deep_work: "bg-emerald-500/15 text-emerald-300",
	code: "bg-sky-500/15 text-sky-300",
	learning: "bg-indigo-500/15 text-indigo-300",
	reading: "bg-teal-500/15 text-teal-300",
	writing: "bg-cyan-500/15 text-cyan-300",
	productivity: "bg-lime-500/15 text-lime-300",
	dopamine_shorts: "bg-rose-500/15 text-rose-300",
	social_media: "bg-rose-500/15 text-rose-300",
	gaming: "bg-orange-500/15 text-orange-300",
	shopping: "bg-amber-500/15 text-amber-300",
	entertainment: "bg-fuchsia-500/15 text-fuchsia-300",
};

function toneFor(category: string | null) {
	if (!category) return "bg-neutral-500/15 text-neutral-400";
	return CATEGORY_TONE[category] ?? "bg-neutral-500/15 text-neutral-400";
}

function fmtTime(ms: number) {
	return new Date(ms).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function fmtDuration(ms: number) {
	return `${Math.round(ms / 60_000)}m`;
}

/** Latest sessions straight from SQLite + their AI categories and rule hits. */
export default function DebugDb() {
	const [sessions, setSessions] = useState<DebugSession[]>([]);
	const [error, setError] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(undefined);
		try {
			setSessions(
				await invoke<DebugSession[]>("get_last_n_sessions", { n: 20 }),
			);
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	return (
		<DebugShell
			title="Debug — Database"
			subtitle="Latest 20 sessions with AI category + rule matches. Re-run after a demo or extension flush."
		>
			<Card
				title={`Latest sessions (${sessions.length})`}
				right={
					<ActionButton
						label="Refresh"
						loading={loading}
						onClick={() => void load()}
					/>
				}
			>
				{error ? <p className="text-sm text-rose-400">{error}</p> : null}
				{!loading && sessions.length === 0 ? (
					<p className="text-sm text-neutral-500">
						No sessions yet. Use the Demo Harness to seed data, or press
						Refresh.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[720px] border-collapse text-left text-sm">
							<thead>
								<tr className="border-b border-neutral-800 text-xs uppercase tracking-wider text-neutral-500">
									<th className="px-2 py-2">Site</th>
									<th className="px-2 py-2">Start</th>
									<th className="px-2 py-2">Duration</th>
									<th className="px-2 py-2">AI category</th>
									<th className="px-2 py-2">Graph</th>
								</tr>
							</thead>
							<tbody>
								{sessions.map((s) => (
									<tr key={s.id} className="border-b border-neutral-900/80">
										<td className="px-2 py-2">
											<p className="font-medium">{s.hostname}</p>
											<p className="max-w-[260px] truncate text-xs text-neutral-500">
												{s.url}
											</p>
										</td>
										<td className="px-2 py-2 text-neutral-300">
											{fmtTime(s.startedAt)}
										</td>
										<td className="px-2 py-2 text-neutral-300">
											{fmtDuration(s.durationMs)}
										</td>
										<td className="px-2 py-2">
											<span
												className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneFor(s.aiCategory)}`}
											>
												{s.aiCategory ?? "pending"}
											</span>
										</td>
										<td className="px-2 py-2 text-neutral-300">
											{s.processedForGraph === 1 ? "yes" : "no"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</DebugShell>
	);
}
