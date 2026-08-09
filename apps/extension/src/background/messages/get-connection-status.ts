import type { PlasmoMessaging } from "@plasmohq/messaging";
import { desktopBridge } from "~lib/desktop-bridge";
import { loadOfflineAccumulator } from "~lib/store";

interface ConnectionStatusResponse {
    connected: boolean;
    port: number | null;
    passiveMode: boolean;
    unsyncedCount: number;
    clientId: string | null;
    browserType: string;
}

async function getUnsyncedEventCount(): Promise<number> {
    const [logCount, accumulator] = await Promise.all([
        desktopBridge.getUnsyncedCount(),
        loadOfflineAccumulator()
    ]);
    return logCount + Object.keys(accumulator).length;
}

const handler: PlasmoMessaging.MessageHandler<void, ConnectionStatusResponse> = async (_req, res) => {
    try {
        const status = await desktopBridge.getStatus();
        const unsyncedCount = await getUnsyncedEventCount();
        res.send({
            connected: status.connected,
            port: status.cachedWsPort,
            passiveMode: status.passiveMode,
            unsyncedCount,
            clientId: status.clientId,
            browserType: status.browserType
        });
    } catch (error) {
        console.error("get-connection-status handler error:", error);
        res.send({
            connected: false,
            port: null,
            passiveMode: false,
            unsyncedCount: 0,
            clientId: null,
            browserType: "unknown"
        });
    }
};

export default handler;