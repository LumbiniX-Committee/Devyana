import { sendToBackground } from "@plasmohq/messaging";
import type { BridgeStatus, InterventionTaskType } from "@vinaya/behavior-core";
import { useCallback, useEffect, useRef, useState } from "react";
import "./style.css";

type StatusPayload = {
	bridge: BridgeStatus;
	activeSession: {
		hostname: string;
		pathname: string;
		startedAt: number;
		primaryRuleId: string;
	} | null;
	ruleCount: number;
};

type CooldownStatusResponse = {
	onCooldown: boolean;
	until?: number;
	ruleId?: string;
};

type TriggerInterventionResponse = {
	ok: boolean;
	error?: string;
};

type TestBlockResponse = {
    ok: boolean
    error?: string
}

type RulesPayload = {
	rules: Array<LiveRule>;
};

function IndexPopup() {
	const [status, setStatus] = useState<StatusPayload | null>(null);
	const [loading, setLoading] = useState(false);
	const [retrying, setRetrying] = useState(false);
	const [toast, setToast] = useState<{
		message: string;
		type: "success" | "error";
	} | null>(null);
	const [selectedType, setSelectedType] =
		useState<InterventionTaskType>("inhale_exhale");
	const [interventionParams, setInterventionParams] = useState<
		Record<string, unknown>
	>({});
	const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
	const [cooldownInfo, setCooldownInfo] =
		useState<CooldownStatusResponse | null>(null);
	const [cooldownTimer, setCooldownTimer] = useState<number | null>(null);
	const [rules, setRules] = useState<Array<LiveRule>>([]);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const data = await sendToBackground<undefined, StatusPayload>({
				name: "extension-status",
			});
			setStatus(data);

			if (activeTab?.url) {
				const url = new URL(activeTab.url);
				const cooldown = await sendToBackground<
					{ hostname: string },
					CooldownStatusResponse
				>({
					name: "cooldown-status",
					body: { hostname: url.hostname },
				});
				setCooldownInfo(cooldown);
			}
		} catch (err) {
			console.error("Status error:", err);
		} finally {
			setLoading(false);
		}
	}, [activeTab?.url]);

	const fetchRules = useCallback(async () => {
		try {
			const data = await sendToBackground<undefined, RulesPayload>({
				name: "get-rules",
			});
			setRules(data.rules);
		} catch (err) {
			console.error("Rules fetch error:", err);
		}
	}, []);

	useEffect(() => {
		void refresh();
		void fetchRules();

		intervalRef.current = setInterval(() => {
			void refresh();
		}, 2000);

		chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
			if (tab) setActiveTab(tab);
		});

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			if (cooldownIntervalRef.current)
				clearInterval(cooldownIntervalRef.current);
		};
	}, [refresh, fetchRules]);

	useEffect(() => {
		if (cooldownInfo?.until) {
			const updateTimer = () => {
				const until = cooldownInfo.until;
				const remaining = until
					? Math.max(0, Math.ceil((until - Date.now()) / 1000))
					: 0;
				setCooldownTimer(remaining);
				if (remaining <= 0) {
					if (cooldownIntervalRef.current)
						clearInterval(cooldownIntervalRef.current);
					void refresh();
				}
			};
			updateTimer();
			cooldownIntervalRef.current = setInterval(updateTimer, 1000);
		} else {
			if (cooldownIntervalRef.current)
				clearInterval(cooldownIntervalRef.current);
			setCooldownTimer(null);
		}
		return () => {
			if (cooldownIntervalRef.current)
				clearInterval(cooldownIntervalRef.current);
		};
	}, [cooldownInfo, refresh]);

	const showToast = (message: string, type: "success" | "error") => {
		setToast({ message, type });
		setTimeout(() => setToast(null), 3000);
	};

	const handleRetryConnection = useCallback(async () => {
		setRetrying(true);
		try {
			await sendToBackground<void, TriggerInterventionResponse>({
				name: "retry-connection",
			});
			setTimeout(() => void refresh(), 1000);
			showToast("Connection retry initiated", "success");
		} catch (err) {
			showToast(`Retry failed: ${String(err)}`, "error");
		} finally {
			setRetrying(false);
		}
	}, [refresh, showToast]);

	const handleTriggerIntervention = useCallback(async () => {
		if (!activeTab?.id) {
			showToast("No active tab", "error");
			return;
		}

		const tab = activeTab;
		const rawUrl = tab.url || tab.pendingUrl;
		if (
			!rawUrl ||
			rawUrl.startsWith("chrome://") ||
			rawUrl.startsWith("chrome-extension://") ||
			rawUrl.startsWith("edge://") ||
			rawUrl.startsWith("about:")
		) {
			showToast("Cannot trigger intervention on this page", "error");
			return;
		}

		if (cooldownInfo?.onCooldown) {
			showToast("Cooldown active for this site", "error");
			return;
		}

		try {
			const result = await sendToBackground<
				{
					tabId: number;
					taskType: InterventionTaskType;
					params?: Record<string, unknown>;
					durationSec?: number;
				},
				TriggerInterventionResponse
			>({
				name: "trigger-intervention",
				body: {
					tabId: tab.id ?? 0,
					taskType: selectedType,
					params: interventionParams,
					durationSec: interventionParams.durationSec as number | undefined,
				},
			});

			if (result.ok) {
				showToast("Intervention triggered", "success");
			} else {
				showToast(`Failed: ${result.error ?? "Unknown error"}`, "error");
			}
		} catch (err) {
			showToast(`Error: ${String(err)}`, "error");
		}
	}, [activeTab, cooldownInfo, selectedType, interventionParams, showToast]);

	const handleTestBlock = useCallback(
		async (command: "hard_block" | "soft_block" | "show_warning" | "unblock") => {
			if (!activeTab?.id) {
				showToast("No active tab", "error");
				return;
			}

			try {
				const result = await sendToBackground<
					{ command: "hard_block" | "soft_block" | "show_warning" | "unblock"; tabId: number },
					TestBlockResponse
				>({
					name: "test-block",
					body: { command, tabId: activeTab.id },
				});

				if (result.ok) {
					showToast(`${command} sent`, "success");
				} else {
					showToast(`Failed: ${result.error ?? "Unknown error"}`, "error");
				}
			} catch (err) {
				showToast(`Error: ${String(err)}`, "error");
			}
		},
		[activeTab, showToast]
	);

	const handleParamChange = (key: string, value: unknown) => {
		setInterventionParams((prev) => ({ ...prev, [key]: value }));
	};

	const bridge = status?.bridge;

	const interventionTypes: {
		type: InterventionTaskType;
		label: string;
		implemented: boolean;
		params: Array<{
			key: string;
			label: string;
			type: "number" | "text" | "number";
		}>;
	}[] = [
		{
			type: "inhale_exhale",
			label: "Inhale & Exhale",
			implemented: true,
			params: [{ key: "durationSec", label: "Duration (sec)", type: "number" }],
		},
		{
			type: "realization",
			label: "Realization",
			implemented: true,
			params: [
				{ key: "question", label: "Question", type: "text" },
				{ key: "minChars", label: "Min chars", type: "number" },
			],
		},
		{
			type: "divine_followups",
			label: "Divine Followups",
			implemented: true,
			params: [
				{
					key: "stepDurationSec",
					label: "Step duration (sec)",
					type: "number",
				},
			],
		},
		{
			type: "quiz",
			label: "Quiz",
			implemented: false,
			params: [],
		},
		{
			type: "story",
			label: "Story",
			implemented: false,
			params: [],
		},
		{
			type: "challenge",
			label: "Challenge",
			implemented: false,
			params: [],
		},
	];

	const currentTypeConfig = interventionTypes.find(
		(t) => t.type === selectedType,
	);

	return (
		<div className="w-[360px] h-[500px] bg-zinc-950 p-4 font-sans text-zinc-100 overflow-y-auto">
			<header className="mb-3 flex items-center justify-between">
				<h1 className="text-base font-semibold tracking-wide">
					Frocus <span className="text-emerald-400">Control</span>
				</h1>
				<button
					type="button"
					onClick={() => void refresh()}
					disabled={loading}
					className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
				>
					{loading ? "⟳" : "Refresh"}
				</button>
			</header>

			{/* Connection Status Bar */}
			<section className="mb-3 space-y-2 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
				<div className="flex items-center justify-between">
					<span className="flex items-center gap-2 text-sm">
						<span
							className={`h-2.5 w-2.5 rounded-full ${bridge?.connected ? "bg-emerald-400" : "bg-rose-500"}`}
						/>
						<span className="font-medium">
							{bridge?.connected ? "Connected" : "Disconnected"}
						</span>
					</span>
					{bridge?.cachedWsPort && (
						<span className="text-xs text-zinc-400 font-mono">
							Port {bridge.cachedWsPort}
						</span>
					)}
				</div>

				<div className="flex items-center justify-between text-xs text-zinc-400">
					<span>Unsynced events</span>
					<span className="font-mono text-zinc-200">
						{bridge?.unsyncedCount ?? "—"} pending sync
					</span>
				</div>

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handleRetryConnection}
						disabled={retrying || bridge?.connected}
						className="flex-1 rounded-md border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{retrying ? (
							<span className="flex items-center justify-center gap-1">
								<span className="animate-spin">⟳</span> Retrying…
							</span>
						) : bridge?.connected ? (
							"Connected"
						) : (
							"Retry Connection"
						)}
					</button>
				</div>

				{bridge?.passiveMode && (
					<div className="rounded-md border border-yellow-800 bg-yellow-950/60 px-2 py-1.5 text-[11px] leading-snug text-yellow-200">
						⚠ Desktop app not found. Data will be stored locally and synced
						later.
					</div>
				)}
			</section>

			{/* Intervention Testing Panel */}
			<section className="mb-3 space-y-3">
				<h2 className="text-sm font-semibold text-zinc-300">
					Buddha's Palm Test
				</h2>

				{activeTab ? (
					<>
						<div
							className="text-xs text-zinc-500 truncate"
							title={activeTab.url ?? ""}
						>
							{activeTab.url ? new URL(activeTab.url).hostname : "No URL"}
						</div>

						<div className="flex flex-wrap gap-1">
{interventionTypes.map(({ type, label, implemented }) => (
								<button
									type="button"
									key={type}
									onClick={() => {
										if (implemented) {
											setSelectedType(type);
											setInterventionParams({});
										}
									}}
									disabled={!implemented}
									className={`rounded-md px-2 py-1 text-xs transition-colors ${
										selectedType === type
											? "bg-emerald-600 text-white"
											: implemented
											? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
											: "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
									}`}
									title={implemented ? "" : "Coming soon"}
								>
									{label}
								</button>
							))}
						</div>

						{currentTypeConfig?.params.length && (
							<div className="space-y-2 p-2 bg-zinc-900 rounded border border-zinc-800">
								{currentTypeConfig.params.map(({ key, label, type }) => (
									<div key={key} className="space-y-1">
										<label className="text-xs text-zinc-400">{label}</label>
										{type === "text" ? (
											<input
												type="text"
												value={(interventionParams[key] as string) ?? ""}
												onChange={(e) => handleParamChange(key, e.target.value)}
												className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
												placeholder={
													key === "question" ? "What were you about to do?" : ""
												}
											/>
										) : (
											<input
												type="number"
												value={(interventionParams[key] as number) ?? ""}
												onChange={(e) =>
													handleParamChange(
														key,
														Number(e.target.value) || undefined,
													)
												}
												className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
												min="1"
											/>
										)}
									</div>
								))}
							</div>
						)}

						<button
							onClick={handleTriggerIntervention}
							disabled={
								!currentTypeConfig?.implemented ||
								cooldownInfo?.onCooldown ||
								!activeTab?.id
							}
							className="w-full rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                                bg-emerald-600 text-white hover:bg-emerald-500"
						>
							{cooldownInfo?.onCooldown ? (
								<>
									<span className="flex items-center justify-center gap-1">
										<span className="animate-spin">⟳</span>
										Cooldown: {cooldownTimer}s
									</span>
								</>
							) : (
								"Trigger Intervention"
							)}
						</button>

						{cooldownInfo?.onCooldown && (
							<p className="text-xs text-yellow-400 text-center">
								Cooldown active for {cooldownInfo.ruleId ?? "this site"}.
								Expires in {cooldownTimer}s.
							</p>
						)}
					</>
				) : (
					<p className="text-xs text-zinc-500 text-center py-4">
						No accessible tab
					</p>
				)}
			</section>

			{/* Quick Settings / Debug */}
			<section className="space-y-3">
				<h2 className="text-sm font-semibold text-zinc-300">
					Debug & Settings
				</h2>

				<div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 space-y-2">
					<h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Emit Rule Preview
					</h3>
					<div className="space-y-1 max-h-40 overflow-y-auto">
						{rules.length > 0 ? (
							rules
								.filter(
									(r) => r.behavior.emit !== "fallback" || r.id === "other",
								)
								.slice(0, 6)
								.map((rule) => (
									<div
										key={rule.id}
										className="flex items-center justify-between text-xs"
									>
										<span className="text-zinc-300 truncate pr-2">
											{rule.id}
										</span>
										<span
											className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
												rule.behavior.emit === "never"
													? "bg-rose-900/50 text-rose-400"
													: rule.behavior.emit === "always"
														? "bg-emerald-900/50 text-emerald-400"
														: "bg-yellow-900/50 text-yellow-400"
											}`}
										>
											{rule.behavior.emit}
										</span>
									</div>
								))
						) : (
							<p className="text-xs text-zinc-500">Loading rules…</p>
						)}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<button
						onClick={async () => {
							try {
								await sendToBackground<void, TriggerInterventionResponse>({
									name: "prune-log",
								});
								showToast("Synced events cleared", "success");
								void refresh();
							} catch (err) {
								showToast(`Error: ${String(err)}`, "error");
							}
						}}
						className="rounded-md border border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-800"
					>
						Clear synced events
					</button>

					<button
						onClick={() => {
							chrome.tabs.create({
								url: chrome.runtime.getURL("tabs/setup.html"),
							});
						}}
						className="rounded-md border border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-800"
					>
						Open dashboard
					</button>
				</div>

				<div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 space-y-2">
					<h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Block Commands Test
					</h3>
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							onClick={() => handleTestBlock("hard_block")}
							disabled={!activeTab?.id}
							className="rounded-md border border-rose-700 bg-rose-900/30 px-2 py-1.5 text-xs hover:bg-rose-900/50 disabled:opacity-50"
						>
							Hard Block
						</button>
						<button
							type="button"
							onClick={() => handleTestBlock("soft_block")}
							disabled={!activeTab?.id}
							className="rounded-md border border-yellow-700 bg-yellow-900/30 px-2 py-1.5 text-xs hover:bg-yellow-900/50 disabled:opacity-50"
						>
							Soft Block
						</button>
						<button
							type="button"
							onClick={() => handleTestBlock("show_warning")}
							disabled={!activeTab?.id}
							className="rounded-md border border-blue-700 bg-blue-900/30 px-2 py-1.5 text-xs hover:bg-blue-900/50 disabled:opacity-50"
						>
							Warning
						</button>
						<button
							type="button"
							onClick={() => handleTestBlock("unblock")}
							disabled={!activeTab?.id}
							className="rounded-md border border-emerald-700 bg-emerald-900/30 px-2 py-1.5 text-xs hover:bg-emerald-900/50 disabled:opacity-50"
						>
							Unblock
						</button>
					</div>
				</div>

				<div className="text-[11px] text-zinc-600">
					Client: <span className="font-mono">{bridge?.clientId ?? "—"}</span> ·{" "}
					Browser: {bridge?.browserType ?? "—"}
				</div>
			</section>

			{toast && (
				<div
					className={`fixed bottom-4 left-4 right-4 max-w-[360px] z-50 animate-slide-up rounded-md px-3 py-2 text-xs font-medium ${
						toast.type === "success"
							? "border border-emerald-800 bg-emerald-950/60 text-emerald-200"
							: "border border-rose-800 bg-rose-950/60 text-rose-200"
					}`}
				>
					{toast.message}
				</div>
			)}
		</div>
	);
}

export default IndexPopup;
