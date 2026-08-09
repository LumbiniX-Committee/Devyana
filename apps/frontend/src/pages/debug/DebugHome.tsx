import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ActionButton, Card, DebugShell, JsonBlock } from "./ui";

interface SeedReport {
	seededCount: number;
	productiveMinutes: number;
	distractingMinutes: number;
	todayProductiveMinutes: number;
	sessions: Array<{
		dayOffset: number;
		date: string;
		localTime: string;
		hostname: string;
		category: string;
		durationMinutes: number;
	}>;
}

const FLOW_STEPS = ["Configure AI", "Seed data", "Batch classify", "Read status"];

/** One-click demo harness: configures the mock AI, seeds 5 realistic days of
 *  browsing history, triggers a batched AI classification and reports status. */
export default function DebugHome() {
	const [step, setStep] = useState<number | null>(null);
	const [results, setResults] = useState<Record<string, unknown>>({});
	const [status, setStatus] = useState("Idle. Press “Run demo” to execute the full flow.");

	async function runDemo() {
		setResults({});
		try {
			setStep(0);
			setStatus("Configuring mock AI endpoints…");
			await invoke("configure_mock_ai", {});

			setStep(1);
			setStatus("Seeding 5 days of sessions…");
			const seed = await invoke<SeedReport>("seed_test_data");
			setResults({ seed });

			setStep(2);
			setStatus("Triggering AI batch (awaiting classification)…");
			const batch = await invoke<{ classified: number; n: number }>("trigger_ai_batch");
			setResults((r) => ({ ...r, batch }));

			setStep(3);
			setStatus("Querying AI status…");
			const aiStatus = await invoke("get_ai_status");
			setResults((r) => ({ ...r, aiStatus }));

			setStep(4);
			setStatus("Demo complete. The dashboard and analytics below are now populated.");
		} catch (err) {
			setStep(4);
			setStatus(`Demo failed: ${String(err)}`);
		}
	}

	const done = step === null ? -1 : step - 1;

	return (
		<DebugShell
			title="Debug — Demo Harness"
			subtitle="Simulates the full extension → algorithm → analytics pipeline in seconds."
		>
			<Card title="Mock AI endpoint">
				<div className="flex flex-wrap items-center gap-3">
					<ActionButton label="Run demo flow" onClick={() => void runDemo()} />
					<p className="text-xs text-neutral-500">
						Requires the mock server first:{" "}
						<code className="rounded bg-neutral-950 px-1.5 py-0.5 text-emerald-300">
							node scripts/mock-ai.js
						</code>
					</p>
				</div>
				<p className="text-xs text-neutral-500">
					Points the 4 Intelligence Layer URLs at{" "}
					<code className="text-emerald-300">http://127.0.0.1:8787</code>, seeds 5
					realistic days of history, then flushes one compressed batch. Then check the
					teal graph and the green dashboard.
				</p>
			</Card>

			<Card title="Flow progress">
				<ul className="flex flex-wrap items-center gap-2 text-sm">
					{FLOW_STEPS.map((label, i) => {
						const active = i <= done;
						return (
							<li key={label}>
								<span
									className={`rounded-full border px-2.5 py-0.5 ${
										active
											? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
											: "border-neutral-700 text-neutral-400"
									}`}
								>
									{i + 1}. {label}
								</span>
							</li>
						);
					})}
				</ul>
			</Card>

			<Card title="Status">
				<p className="text-sm text-neutral-200">{status}</p>
			</Card>

			<Card title="Results">
				{Object.keys(results).length === 0 ? (
					<p className="text-sm text-neutral-500">No results yet.</p>
				) : (
					<JsonBlock value={results} />
				)}
			</Card>

			<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
				<Link
					className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm hover:bg-neutral-900"
					to="/debug/db"
				>
					<p className="font-medium">Latest sessions</p>
					<p className="mt-1 text-neutral-400">raw rows + 24 rules — inspect how a stop spreads.</p>
				</Link>
				<Link
					className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm hover:bg-neutral-900"
					to="/debug/profile"
				>
					<p className="font-medium">Profile</p>
					<p className="mt-1 text-neutral-400">DB row behind daily goals + immediately tasks.</p>
				</Link>
				<Link
					className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm hover:bg-neutral-900"
					to="/health"
				>
					<p className="font-medium">Health</p>
					<p className="mt-1 text-neutral-400">one-screen green dashboard for judges.</p>
				</Link>
			</div>
		</DebugShell>
	);
}