import { sendToBackground } from "@plasmohq/messaging";
import { useCallback, useEffect, useState } from "react";
import type { BridgeStatus } from "~lib/desktop-bridge";
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

type TestPayload = {
	ok: boolean;
	deliveredWhileConnected: boolean;
	queuedOffline: boolean;
};

function IndexPopup() {
	const [status, setStatus] = useState<StatusPayload | null>(null);
	const [loading, setLoading] = useState(false);
	const [pong, setPong] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setPong(null);
		try {
			const data = await sendToBackground<undefined, StatusPayload>({
				name: "extension-status",
			});
			setStatus(data);
		} catch (err) {
			setPong(`Status error: ${String(err)}`);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const sendTest = useCallback(async () => {
		setPong(null);
		try {
			const result = await sendToBackground<undefined, TestPayload>({
				name: "test-event",
			});
			setPong(
				result.deliveredWhileConnected
					? "Sent over a live WebSocket. Check the desktop log for: Ping received from extension (ack sent)."
					: "Desktop not connected. Queued offline; will be delivered on the next connect.",
			);
		} catch (err) {
			setPong(`Send error: ${String(err)}`);
		}
	}, []);

	const openPage = (path: string) => () => {
		void chrome.tabs.create({ url: `http://localhost:1420${path}` });
	};

	const bridge = status?.bridge;

	return (
		<div className="w-[340px] bg-zinc-950 p-4 font-sans text-zinc-100">
			<header className="mb-3 flex items-center justify-between">
				<h1 className="text-base font-semibold tracking-wide">
					Viyana <span className="text-emerald-400">Debug</span>
				</h1>
				<button
					onClick={() => void refresh()}
					type="button"
					className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
				>
					Refresh
				</button>
			</header>

			<section className="mb-3 space-y-1.5">
				<StatusDot
					label="Desktop WS"
					value={bridge?.connected ? "Connected" : "Disconnected"}
					ok={bridge?.connected}
				/>
				<StatusDot
					label="Cached port"
					value={bridge?.cachedWsPort ?? "—"}
					ok={bridge?.connected === true}
				/>
				<StatusDot
					label="Passive mode"
					value={bridge?.passiveMode ? "yes" : "no"}
					ok={bridge?.passiveMode === false}
				/>
				<StatusDot
					label="Unsynced events"
					value={bridge?.unsyncedCount ?? "—"}
					ok={bridge ? bridge.unsyncedCount === 0 : undefined}
				/>
				<StatusDot
					label="Active session"
					value={
						status?.activeSession
							? `${status.activeSession.hostname}${status.activeSession.pathname}`
							: "none"
					}
					ok={undefined}
				/>
				<StatusDot
					label="Rule count"
					value={status?.ruleCount ?? "—"}
					ok={undefined}
				/>
				<p className="pt-1 text-[11px] text-zinc-500">
					client: <span className="font-mono">{bridge?.clientId ?? "—"}</span> ·{" "}
					browser: {bridge?.browserType ?? "—"}
				</p>
			</section>

			<div className="mb-3 flex gap-2">
				<button
					onClick={() => void sendTest()}
					type="button"
					className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
				>
					Send test event
				</button>
			</div>

			{pong ? (
				<p className="mb-3 rounded-md border border-emerald-800 bg-emerald-950/60 px-2 py-1.5 text-[11px] leading-snug text-emerald-200">
					{pong}
				</p>
			) : null}

			{loading ? (
				<p className="mb-3 text-[11px] text-zinc-500">Refreshing…</p>
			) : null}

			<div className="mb-3 grid grid-cols-2 gap-2">
				<button
					onClick={openPage("/health")}
					type="button"
					className="rounded-md border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800"
				>
					Open health page
				</button>
				<button
					onClick={openPage("/debug")}
					type="button"
					className="rounded-md border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800"
				>
					Open demo harness
				</button>
			</div>

			<p className="text-[11px] text-zinc-600">
				Shown against the Tauri dev server (localhost:1420). In a packaged build
				these open the desktop window instead.
			</p>
		</div>
	);
}

function StatusDot({
	label,
	value,
	ok,
}: {
	label: string;
	value: string | number;
	ok: boolean | undefined;
}) {
	const dot =
		ok === undefined ? "bg-zinc-500" : ok ? "bg-emerald-400" : "bg-rose-500";
	return (
		<div className="flex items-center justify-between text-xs">
			<span className="text-zinc-400">{label}</span>
			<span className="flex items-center gap-1.5 text-zinc-200">
				<span className={`h-2 w-2 rounded-full ${dot}`} />
				{value}
			</span>
		</div>
	);
}

export default IndexPopup;
