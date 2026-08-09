import type { PlasmoMessaging } from "@plasmohq/messaging";
import { desktopBridge } from "~lib/desktop-bridge";

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
    const wasConnected = desktopBridge.isConnect()
    await desktopBridge.sendTestPing()

    res.send({
        ok: true,
        deliveredWhileConnected: wasConnected,
        queuedOffline: !wasConnected
    })
}

export default handler