import type { DesktopCommand } from "@vinaya/behavior-core";
import type { PlasmoCSConfig } from "plasmo";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

export const config: PlasmoCSConfig = {
	matches: ["<all_urls>"],
	run_at: "document_start",
	all_frames: false,
};

type BlockMessage = DesktopCommand & {
	command:
		| "hard_block"
		| "soft_block"
		| "show_warning"
		| "unblock"
		| "pause_media"
		| "resume_media";
};

type BlockType = "hard_block" | "soft_block" | "show_warning";

interface BlockOverlayProps {
	type: BlockType;
	message?: string;
	reason?: string;
	until?: number;
	gracePeriodMs?: number;
	onUnblock: () => void;
}

let blockMounted: { root: Root; host: HTMLDivElement } | null = null;
let blockUnlock: (() => void) | null = null;
let warningTimer: ReturnType<typeof setTimeout> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function lockPageForBlock(): () => void {
	const rootEl = document.documentElement;
	const prev = {
		overflow: rootEl.style.overflow,
		pointerEvents: rootEl.style.pointerEvents,
	};

	rootEl.style.overflow = "hidden";
	rootEl.style.pointerEvents = "none";

	const swallow = (event: KeyboardEvent) => {
		const target = event.target as HTMLElement | null;
		const editable = Boolean(
			target &&
				(target.isContentEditable ||
					target.tagName === "TEXTAREA" ||
					target.tagName === "INPUT" ||
					target.tagName === "SELECT"),
		);
		const key = event.key.toLowerCase();
		const modified = event.ctrlKey || event.metaKey;

		const safe =
			editable &&
			!["Escape", "F1", "F5", "F11", "F12"].includes(event.key) &&
			(!modified || !["r", "w", "t", "n"].includes(key));

		if (safe) return;
		event.preventDefault();
		event.stopPropagation();
	};

	document.addEventListener("keydown", swallow, true);
	document.addEventListener("keyup", swallow, true);

	// Disable context menu
	const preventContextMenu = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};
	document.addEventListener("contextmenu", preventContextMenu, true);

	return () => {
		rootEl.style.overflow = prev.overflow;
		rootEl.style.pointerEvents = prev.pointerEvents;
		document.removeEventListener("keydown", swallow, true);
		document.removeEventListener("keyup", swallow, true);
		document.removeEventListener("contextmenu", preventContextMenu, true);
	};
}

function unmountBlock(): void {
	if (!blockMounted) return;

	blockMounted.root.unmount();
	blockMounted.host.remove();
	blockMounted = null;

	if (blockUnlock) {
		blockUnlock();
		blockUnlock = null;
	}

	if (warningTimer) {
		clearTimeout(warningTimer);
		warningTimer = null;
	}
	if (countdownTimer) {
		clearInterval(countdownTimer);
		countdownTimer = null;
	}
}

function mountBlock(message: BlockMessage): boolean {
	if (message.command === "unblock") {
		unmountBlock();
		return true;
	}
	if (blockMounted || document.querySelector("[data-viyana-block='true']")) return true;

	const host = document.createElement("div");
	host.dataset.viyanaBlock = "true";

	const shadow = host.attachShadow({ mode: "open" });

	const style = document.createElement("style");
	style.textContent = BLOCK_OVERLAY_STYLE;
	shadow.appendChild(style);

	const container = document.createElement("div");
	shadow.appendChild(container);

	document.documentElement.appendChild(host);

	const root = createRoot(container);
	blockMounted = { root, host };

	blockUnlock = lockPageForBlock();

	const type = message.command as BlockType;
	const msg = "message" in message ? (message as Record<string, unknown>).message as string | undefined : undefined;
	const reason = "reason" in message ? (message as Record<string, unknown>).reason as string | undefined : undefined;
	const until = "until" in message ? (message as Record<string, unknown>).until as number | undefined : undefined;
	const gracePeriodMs = "gracePeriodMs" in message ? (message as Record<string, unknown>).gracePeriodMs as number | undefined : undefined;

	root.render(
		<BlockOverlay
			type={type}
			message={msg}
			reason={reason}
			until={until}
			gracePeriodMs={gracePeriodMs}
			onUnblock={unmountBlock}
		/>,
	);

	return true;
}

function BlockOverlay({
	type,
	message,
	reason,
	until,
	gracePeriodMs,
	onUnblock,
}: BlockOverlayProps) {
	const [remainingSec, setRemainingSec] = useState<number | null>(null);
	const [showWarning, setShowWarning] = useState(true);

	// Handle countdown for cooldown blocks
	useEffect(() => {
		if (until && until > Date.now()) {
			const update = () => {
				const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
				setRemainingSec(remaining);
				if (remaining <= 0) {
					if (countdownTimer) clearInterval(countdownTimer);
					// Don't auto-unblock for hard_block - wait for explicit unblock
				}
			};
			update();
			countdownTimer = setInterval(update, 1000);
		} else if (gracePeriodMs && gracePeriodMs > 0) {
			let remaining = Math.ceil(gracePeriodMs / 1000);
			setRemainingSec(remaining);
			countdownTimer = setInterval(() => {
				remaining -= 1;
				setRemainingSec(remaining);
				if (remaining <= 0) {
					if (countdownTimer) clearInterval(countdownTimer);
					onUnblock();
				}
			}, 1000);
		}

		return () => {
			if (countdownTimer) clearInterval(countdownTimer);
		};
	}, [until, gracePeriodMs, onUnblock]);

	// Auto-dismiss warning after grace period
	useEffect(() => {
		if (type === "show_warning" && gracePeriodMs && gracePeriodMs > 0) {
			warningTimer = setTimeout(() => {
				setShowWarning(false);
				onUnblock();
			}, gracePeriodMs);
		}
		return () => {
			if (warningTimer) clearTimeout(warningTimer);
		};
	}, [type, gracePeriodMs, onUnblock]);

	if (type === "show_warning" && !showWarning) {
		return null;
	}

	const getTitle = () => {
		switch (type) {
			case "hard_block":
				return "Access Blocked";
			case "soft_block":
				return "Site Paused";
			case "show_warning":
				return "Mindful Browsing";
		}
	};

	const getSubtitle = () => {
		if (reason) return reason;
		switch (type) {
			case "hard_block":
				return "This site is blocked during your focus period.";
			case "soft_block":
				return "Take a moment to breathe before continuing.";
			case "show_warning":
				return "Consider if this aligns with your intentions.";
		}
	};

	const getIcon = () => {
		switch (type) {
			case "hard_block":
				return "🚫";
			case "soft_block":
				return "⏸️";
			case "show_warning":
				return "⚠️";
		}
	};

	const formatTime = (sec: number) => {
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		return `${m}:${s.toString().padStart(2, "0")}`;
	};

	return (
		<div
			className={`block-overlay block-${type}`}
			role="alert"
			aria-live="assertive"
		>
			<div className="block-content">
				<div className="block-icon">{getIcon()}</div>
				<h1 className="block-title">{getTitle()}</h1>
				<p className="block-subtitle">{getSubtitle()}</p>
				{message && <p className="block-message">{message}</p>}

				{(until || (gracePeriodMs && gracePeriodMs > 0)) &&
					remainingSec !== null && (
						<div className="block-countdown">
							<span className="countdown-label">
								{until ? "Available in" : "Auto-dismiss in"}
							</span>
							<span className="countdown-value">
								{formatTime(remainingSec)}
							</span>
						</div>
					)}

				{type === "show_warning" && (
					<p className="block-hint">This warning will dismiss automatically.</p>
				)}

				{type !== "hard_block" && type !== "soft_block" && (
					<button type="button" className="block-dismiss" onClick={onUnblock}>
						Dismiss
					</button>
				)}
			</div>
		</div>
	);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message: BlockMessage, _sender, sendResponse) => {
	if (!message || typeof message !== "object" || !("command" in message)) {
		return;
	}

	const command = (message as BlockMessage).command;
	const validCommands = [
		"hard_block",
		"soft_block",
		"unblock",
		"show_warning",
		"pause_media",
		"resume_media",
	];

	if (!validCommands.includes(command)) return;

	console.log("[Viyana Block] Received command:", command, message);
	sendResponse({ vinayaBlockReady: mountBlock(message as BlockMessage) });
	return false;
});

const BLOCK_OVERLAY_STYLE = `
:host(div) {
    all: initial;
    display: block;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: auto;
}

.block-overlay {
    position: fixed;
    inset: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(160deg, #0f172a 0%, #1e293b 55%, #1e3a5f 100%);
    color: #e2e8f0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
    user-select: none;
    text-align: center;
    padding: 24px;
    box-sizing: border-box;
}

.block-content {
    max-width: 480px;
    width: 100%;
    animation: blockFadeIn 300ms ease-out;
}

@keyframes blockFadeIn {
    from {
        opacity: 0;
        transform: scale(0.95);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

.block-icon {
    font-size: 64px;
    margin-bottom: 16px;
    line-height: 1;
}

.block-title {
    margin: 0 0 12px;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: #ffffff;
}

.block-subtitle {
    margin: 0 0 24px;
    font-size: 17px;
    line-height: 1.6;
    color: #cbd5e1;
}

.block-message {
    margin: 0 0 24px;
    padding: 16px;
    border-radius: 12px;
    background: rgba(148, 163, 184, 0.1);
    border: 1px solid rgba(148, 163, 184, 0.2);
    font-size: 15px;
    line-height: 1.5;
    color: #94a3b8;
}

.block-countdown {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin: 24px 0;
    padding: 20px;
    border-radius: 16px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
}

.countdown-label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #93c5fd;
}

.countdown-value {
    font-size: 48px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #f8fafc;
    font-family: "SF Mono", "Monaco", "Inconsolata", monospace;
}

.block-hint {
    margin: 16px 0 0;
    font-size: 13px;
    color: #64748b;
}

.block-dismiss {
    margin-top: 24px;
    border: none;
    border-radius: 999px;
    padding: 14px 32px;
    background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
    color: #ffffff;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: transform 150ms ease, opacity 150ms ease, box-shadow 150ms ease;
    box-shadow: 0 8px 30px rgba(37, 99, 235, 0.45);
}

.block-dismiss:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 36px rgba(37, 99, 235, 0.55);
}

.block-dismiss:active {
    transform: translateY(0);
}

/* Type-specific styling */
.block-hard_block .block-title { color: #f87171; }
.block-hard_block .block-icon { filter: drop-shadow(0 0 20px rgba(248, 113, 113, 0.5)); }

.block-soft_block .block-title { color: #fbbf24; }
.block-soft_block .block-icon { filter: drop-shadow(0 0 20px rgba(251, 191, 36, 0.5)); }

.block-show_warning .block-title { color: #60a5fa; }
.block-show_warning .block-icon { filter: drop-shadow(0 0 20px rgba(96, 165, 250, 0.5)); }
`;
