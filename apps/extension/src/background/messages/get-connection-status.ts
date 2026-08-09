import type { PlasmoMessaging } from "@plasmohq/messaging";
import { desktopBridge } from "~lib/desktop-bridge";

interface ConnectionStatusResponse {
    connected: boolean;
    port: number | null;
    passiveMode: boolean;
    unsyncedCount: number;
    clientId: string | null;
    browserType: string;
}

const handler: PlasmoMessaging.MessageHandler<void, ConnectionStatusResponse> = async (_req, res) => {
    const status = await desktopBridge.getStatus();
    res.send({
        connected: status.connected,
        port: status.cachedWsPort,
        passiveMode: status.passiveMode,
        unsyncedCount: status.unsyncedCount,
        clientId: status.clientId,
        browserType: status.browserType
    });
};

export default handler;