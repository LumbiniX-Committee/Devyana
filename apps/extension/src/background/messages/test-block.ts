import type { PlasmoMessaging } from "@plasmohq/messaging";

interface TestBlockRequest {
	command: "hard_block" | "soft_block" | "show_warning" | "unblock";
	tabId: number;
}

interface TestBlockResponse {
	ok: boolean;
	error?: string;
}

const handler: PlasmoMessaging.MessageHandler<
	TestBlockRequest,
	TestBlockResponse
> = async (req, res) => {
	const { command, tabId } = req.body;

	try {
		await chrome.tabs.sendMessage(tabId, {
			command,
			tabId,
			reason: "Test block from popup",
			until: command === "hard_block" ? Date.now() + 60_000 : undefined,
			message: "This is a test block message",
			gracePeriodMs: command === "show_warning" ? 10_000 : undefined,
		});
		res.send({ ok: true });
	} catch (error) {
		res.send({ ok: false, error: String(error) });
	}
};

export default handler;
