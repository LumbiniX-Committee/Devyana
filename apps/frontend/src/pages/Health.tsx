import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ActionButton, Card, DebugShell } from "./debug/ui";

interface HealthCheckRow {
	name: string;
	ok: boolean;
	detail: string;
}

interface HealthReport {
	generatedAtMs: number;
	checks: HealthCheckRow[];
	allOk: boolean;
}

/** One-screen pipeline health check: green/red tiles for WebSocket server,
 *  database connectivity, AI reachability, profile and latest session. */
export default function Health() {
	const [report, setReport] = useState<HealthReport | null>(null);
	const [error, setError] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState(false);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(undefined);
		try {
			const data = await invoke<HealthReport>("get_health");
			setReport(data);
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return (
		<DebugShell
			title="Health Check"
			subtitle="Runs every pipeline check in one click — show this screen to judges."
		>
			<Card
				title="Pipeline status"
				right={
					<div className="flex items-center gap-2">
						{report ? (
							<span
								className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
									report.allOk
										? "bg-emerald-500/15 text-emerald-300"
										: "bg-rose-500/15 text-rose-300"
								}`}
							>
								{report.allOk ? "ALL SYSTEMS GO" : "ISSUES FOUND"}
							</span>
						) : null}
						<ActionButton
							label="Re-run"
							loading={loading}
							onClick={() => void refresh()}
						/>
					</div>
				}
			>
				{error ? <p className="text-sm text-rose-400">{error}</p> : null}
				{!report ? (
					<p className="text-sm text-neutral-500">Running checks…</p>
				) : (
					<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{report.checks.map((check) => (
							<li
								key={check.name}
								className="flex items-start justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5"
							>
								<div>
									<p className="text-sm font-medium">
										{check.name.replaceAll("_", " ")}
									</p>
									<p className="mt-0.5 text-xs text-neutral-400">
										{check.detail}
									</p>
								</div>
								{check.ok ? (
									<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
								) : (
									<XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
								)}
							</li>
						))}
					</ul>
				)}
			</Card>

			<Card title="Raw JSON">
				<pre className="max-h-80 overflow-auto rounded-lg bg-neutral-950 p-3 text-xs text-emerald-200/90">
					{report
						? JSON.stringify(report, null, 2)
						: "Waiting for backend response…"}
				</pre>
			</Card>
		</DebugShell>
	);
}
