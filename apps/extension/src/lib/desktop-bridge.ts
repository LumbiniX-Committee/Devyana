import iconUrl from "url:~assets/icon.development.png";
import type {
	BrowserType,
	DesktopCommand,
	ServerMessage,
	SystemEvent,
	VinayaEvent,
} from "@vinaya/behavior-core";
import { DEFAULT_BREATHING_SEC } from "~background/enforcement";
import { saveTasks } from "~lib/store";

const PORT_RANGE_START = 7423;
const PORT_RANGE_END = 7433;
const PORT_PROBE_TIMEOUT_MS = 400;
const PORT_CACHE_KEY = "vinaya_ws_port";
const WS_ORIGIN_OVERRIDE =
	process.env.PLASMO_PUBLIC_WS_ORIGIN ||
	(import.meta as { env?: Record<string, string> }).env
		?.PLASMO_PUBLIC_WS_ORIGIN;

const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const PASSIVE_THRESHOLD = 10;
const PASSIVE_RETRY_MS = 5 * 60_000;
const CLIENT_ID_KEY = "vinaya_client_id";

const EVENT_LOG_KEY = "vinaya_bridge_log";
const EVENT_LOG_CAP = 500;
const EVENT_LOG_TTL_MS = 30 * 24 * 60 * 60_000;

type LogEntry = {
	id: string;
	event: VinayaEvent;
	timestamp: number;
	synced: boolean;
};

export type BridgeStatus = {
	connected: boolean;
	passiveMode: boolean;
	clientId: string | null;
	browserType: BrowserType;
	cachedWsPort: number | null;
	originOverride: string | null;
	unsyncedCount: number;
};

function detectBrowser(): BrowserType {
	const userAgent = navigator.userAgent;
	if (userAgent.includes("Edg/")) return "edge";
	if (userAgent.includes("OPR/")) return "opera";
	if (userAgent.includes("Brave")) return "brave";
	if (userAgent.includes("Firefox")) return "firefox";
	if (userAgent.includes("Chrome")) return "chrome";
	return "unknown";
}

async function discoverPort(): Promise<number | null> {
	const stored = await chrome.storage.local.get(PORT_CACHE_KEY);
	const cached = stored[PORT_CACHE_KEY] as number | undefined;

	if (cached && (await probePort(cached))) {
		console.log("Discovered port (cached):", cached);
		return cached;
	}

	for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
		if (port === cached) continue;

		if (await probePort(port)) {
			console.log("Discovered port:", port);
			await chrome.storage.local.set({ [PORT_CACHE_KEY]: port });
			return port;
		}
	}

	return null;
}

function probePort(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = new WebSocket(`ws://127.0.0.1:${port}`);

		const timer = setTimeout(() => {
			socket.close();
			resolve(false);
		}, PORT_PROBE_TIMEOUT_MS);

		socket.onopen = () => {
			clearTimeout(timer);
			socket.close();
			resolve(true);
		};

		socket.onerror = () => {
			clearTimeout(timer);
			resolve(false);
		};
	});
}

function normalizeWebSocketUrl(origin: string): string {
	const trimmed = origin.trim().replace(/\/$/, "");

	if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
		return trimmed;
	}

	if (trimmed.startsWith("http://")) {
		return `ws://${trimmed.slice("http://".length)}`;
	}

	if (trimmed.startsWith("https://")) {
		return `wss://${trimmed.slice("https://".length)}`;
	}

	return `wss://${trimmed}`;
}

async function discoverWebSocketUrl(): Promise<string | null> {
	if (WS_ORIGIN_OVERRIDE) return normalizeWebSocketUrl(WS_ORIGIN_OVERRIDE);

	const port = await discoverPort();
	if (!port) return null;
	return `ws://127.0.0.1:${port}`;
}

async function getOrCreateClientId(): Promise<string> {
	const stored = await chrome.storage.local.get(CLIENT_ID_KEY);
	const existing = stored[CLIENT_ID_KEY] as string | null;

	if (existing) return existing;

	const id = crypto.randomUUID();

	await chrome.storage.local.set({ [CLIENT_ID_KEY]: id });

	return id;
}

async function readLog(): Promise<Array<LogEntry>> {
	const data = await chrome.storage.local.get(EVENT_LOG_KEY);
	return (data[EVENT_LOG_KEY] as Array<LogEntry> | undefined) ?? [];
}

async function writeLog(log: Array<LogEntry>): Promise<void> {
	await chrome.storage.local.set({ [EVENT_LOG_KEY]: log });
}

async function appendToLog(event: VinayaEvent): Promise<LogEntry> {
	const entry: LogEntry = {
		id: crypto.randomUUID(),
		event,
		timestamp: Date.now(),
		synced: false,
	};

	const log = await readLog();
	let next = [...log, entry];

	if (next.length > EVENT_LOG_CAP) {
		const unsynced = next.filter((event) => !event.synced);
		const synced = next
			.filter((event) => event.synced)
			.sort((a, b) => b.timestamp - a.timestamp);

		const slotForSynced = Math.max(0, EVENT_LOG_CAP - unsynced.length);
		next = [...unsynced, ...synced.slice(0, slotForSynced)].sort(
			(a, b) => a.timestamp - b.timestamp,
		);
	}

	await writeLog(next);

	return entry;
}

async function markSynced(ids: Array<string>): Promise<void> {
	if (!ids.length) return;

	const log = await readLog();
	const idSet = new Set(ids);
	let changed = false;

	for (const entry of log) {
		if (idSet.has(entry.id) && !entry.synced) {
			entry.synced = true;
			changed = true;
		}
	}

	if (changed) await writeLog(log);
}

async function pruneLog(): Promise<void> {
	const cutoff = Date.now() - EVENT_LOG_TTL_MS;
	const log = await readLog();
	const pruned = log.filter(
		(event) => !event.synced || event.timestamp > cutoff,
	);

	if (pruned.length !== log.length) await writeLog(pruned);
}

class DesktopBridgeClient {
	private socket: WebSocket | null = null;
	private connected = false;

	private clientId: string | null = null;
	private readonly browserType = detectBrowser();

	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private passiveMode = false;

	/**
	 * Registered by the tracker. Invoked (sequentially, awaited) every time a
	 * connection is established, BEFORE the offline log is drained, so the
	 * tracker can flush its offline aggregation accumulator first.
	 */
	private connectHandlers: Array<() => undefined | Promise<unknown>> = [];

	/** Invoked when the bridge switches to passive (long-offline) mode. */
	private passiveHandlers: Array<() => void> = [];

	constructor() {
		this.boot();
	}

	/**
	 * Registers a handler run after each successful (re)connect, prior to the
	 * offline log replay. Used by the tracker to flush the accumulator.
	 */
	onConnect(handler: () => undefined | Promise<unknown>): void {
		this.connectHandlers.push(handler);
	}

	/** Registers a handler invoked when the bridge enters passive mode. */
	onPassiveMode(handler: () => void): void {
		this.passiveHandlers.push(handler);
	}

	/** Number of unsynced (offline, pending) events in the on-disk log. */
	async getUnsyncedCount(): Promise<number> {
		const log = await readLog();
		return log.filter((entry) => !entry.synced).length;
	}

	/**
	 * Diagnostic snapshot for the popup debug panel. Cheap; safe to call on a
	 * timer or from the UI.
	 */
	async getStatus(): Promise<BridgeStatus> {
		const cached = await chrome.storage.local.get(PORT_CACHE_KEY);
		return {
			connected: this.connected,
			passiveMode: this.passiveMode,
			clientId: this.clientId,
			browserType: this.browserType,
			cachedWsPort: (cached[PORT_CACHE_KEY] as number | undefined) ?? null,
			originOverride: WS_ORIGIN_OVERRIDE ?? null,
			unsyncedCount: await this.getUnsyncedCount(),
		};
	}

	/**
	 * Emits a `system_event` / name "ping" over the bridge. The desktop logs
	 * "Ping received from extension (ack sent)" — one-click proof that the
	 * end-to-end extension → desktop path is alive.
	 */
	async sendTestPing(): Promise<void> {
		const ping: SystemEvent = {
			event: "system_event",
			name: "ping",
			message: "debug probe from extension popup",
			data: {
				source: "popup",
				at: Date.now(),
			},
		};
		await this.send(ping);
	}

	private async boot(): Promise<void> {
		this.clientId = await getOrCreateClientId();
		await pruneLog();
		this.connect();
	}

	private async connect(): Promise<void> {
		const url = await discoverWebSocketUrl();

		if (!url) {
			console.log("Desktop WebSocket URL not found");
			void this.onAppUnavailable();
			return;
		}

		console.log("Connecting to desktop:", url);

		this.passiveMode = false;

		try {
			this.socket = new WebSocket(url);
			this.socket.onopen = () => this.onOpen();
			this.socket.onclose = () => this.onClose();
			this.socket.onerror = () => {};
			this.socket.onmessage = ({ data }) => this.onMessage(data as string);
		} catch (_error) {
			this.scheduleReconnect();
		}
	}

	private async onOpen(): Promise<void> {
		this.connected = true;
		this.reconnectAttempts = 0;
		console.log("WebSocket connected:", this.socket?.url);

		// send a handshake
		this.rawSend({
			type: "handshake",
			clientId: this.clientId,
			browserType: this.browserType,
			extensionVersion: chrome.runtime.getManifest().version,
		});
		console.log("Handshake sent", {
			clientId: this.clientId,
			browserType: this.browserType,
			extensionVersion: chrome.runtime.getManifest().version,
		});

		// Let the tracker flush its offline aggregation accumulator into the
		// log before we replay it, so aggregated sessions reach the desktop
		// app on the very first drain.
		for (const handler of this.connectHandlers) {
			await handler();
		}

		// replay the accumulated offline data
		await this.drainLog();
	}

	private onClose(): void {
		this.connected = false;
		this.socket = null;
		this.scheduleReconnect();
	}

	private async onAppUnavailable(): Promise<void> {
		this.reconnectAttempts++;

		if (this.reconnectAttempts >= PASSIVE_THRESHOLD && !this.passiveMode) {
			this.passiveMode = true;

			// Notify the tracker so it can immediately escalate merge
			// tolerance (long offline windows are likely from now on).
			for (const handler of this.passiveHandlers) {
				handler();
			}

			// log

			const { vinayaOfflineNotifiedAt } = await chrome.storage.local.get(
				"vinayaOfflineNotifiedAt",
			);
			const now = Date.now();

			if (
				!vinayaOfflineNotifiedAt ||
				now - vinayaOfflineNotifiedAt > 24 * 60 * 60 * 1000
			) {
				await chrome.storage.local.set({ vinayaOfflineNotifiedAt: now });

				chrome.notifications.clear("vinaya-app-offline", () => {
					chrome.notifications.create("vinaya-app-offline", {
						type: "basic",
						iconUrl,
						title: "Vinaya Desktop app is offline",
						message:
							"Vinaya Desktop application is offline or installed. Click to open it or download the app",
						requireInteraction: true,
					});
				});

				chrome.notifications.onClicked.addListener((id) => {
					if (id === "vinaya-app-offline") {
						chrome.tabs.create({
							url: chrome.runtime.getURL("tabs/setup.html"),
						});
					}
				});
			}
		}
		this.scheduleReconnect();
	}

	private onMessage(raw: string) {
		console.log("WebSocket message:", raw.slice(0, 500));
		let message: ServerMessage;

		try {
			message = JSON.parse(raw) as ServerMessage;
		} catch (_error) {
			console.warn("Unparsable response from desktop", raw.slice(0, 200));
			return;
		}

		if ("type" in message && message.type === "ack") {
			if (Array.isArray(message.ids)) markSynced(message.ids);
			return;
		}

		if (this.isDesktopCommand(message)) this.handleCommand(message);
	}

	private isDesktopCommand(message: ServerMessage): message is DesktopCommand {
		return (
			typeof message === "object" && message !== null && "command" in message
		);
	}

	private handleCommand(command: DesktopCommand): void {
		switch (command.command) {
			case "soft_block":
			case "hard_block":
			case "unblock":
			case "pause_media":
			case "resume_media":
			case "show_warning":
				chrome.tabs.sendMessage(command.tabId, command).catch(() => {});
				break;

			case "update_rules":
				import("~background/index")
					.then(({ tracker }) => tracker.updateRules(command.rules))
					.catch(() => {});
				break;

			case "update_tasks":
				// Persist the task list; the enforcement engine reads it locally
				// when constructing an intervention (no bridge needed).
				saveTasks(command.tasks).catch(() => {});
				break;

			case "show_intervention":
				import("~background/index")
					.then(({ tracker }) => {
						tracker.forceIntervention(command.tabId, {
							taskType: command.taskType ?? "inhale_exhale",
							params: command.params,
							durationSec: command.durationSec ?? DEFAULT_BREATHING_SEC,
							tasks: command.tasks ?? [],
						});
					})
					.catch(() => {});
				break;

			case "set_focus_mode":
				import("~background/index")
					.then(({ tracker }) => tracker.setFocusMode(command))
					.catch(() => {});
				break;
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;

		const delay = this.passiveMode
			? PASSIVE_RETRY_MS
			: Math.min(
					BASE_RECONNECT_MS * 2 ** this.reconnectAttempts,
					MAX_RECONNECT_MS,
				);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	private async drainLog(): Promise<void> {
		const log = await readLog();
		const unsynced = log.filter((event) => !event.synced);

		if (!unsynced.length) return;

		for (const entry of unsynced) {
			if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) break;
			this.rawSend({ entryId: entry.id, ...entry.event });
		}
	}

	private rawSend(data: object): void {
		if (!this.socket) return;
		try {
			this.socket.send(JSON.stringify(data));
		} catch (_error) {}
	}

	async send(event: VinayaEvent) {
		const entry = await appendToLog(event);

		if (
			this.connected &&
			this.socket &&
			this.socket.readyState === WebSocket.OPEN
		) {
			this.rawSend({ entryId: entry.id, ...event });
		}
		console.log("Event: ", event);
	}

	ensureConnect() {
		if (!this.connected && !this.reconnectTimer) this.connect();
	}

	retry(): void {
		this.ensureConnect();
	}

	getClientId(): string | null {
		return this.clientId;
	}

	getBrowserType(): BrowserType {
		return this.browserType;
	}

	isConnect(): boolean {
		return this.connected;
	}

	isPassiveMode(): boolean {
		return this.passiveMode;
	}
}

export const desktopBridge = new DesktopBridgeClient();
