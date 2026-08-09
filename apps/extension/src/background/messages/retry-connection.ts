import type { PlasmoMessaging } from "@plasmohq/messaging";
import { desktopBridge } from "~lib/desktop-bridge";

interface RetryConnectionResponse {
    ok: boolean;
    error?: string;
}

const handler: PlasmoMessaging.MessageHandler<void, RetryConnectionResponse> = async (_req, res) => {
    try {
        desktopBridge.ensureConnect();
        res.send({ ok: true });
    } catch (error) {
        res.send({ ok: false, error: String(error) });
    }
};

export default handler