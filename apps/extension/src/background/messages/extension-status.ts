import type { PlasmoMessaging } from "@plasmohq/messaging";
import { desktopBridge } from "~lib/desktop-bridge";
import { tracker } from "~background/index";

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
    try {
        const bridge = await desktopBridge.getStatus()
        const session = tracker.getSession()

        res.send({
            bridge,
            activeSession: session
                ? {
                    hostname: session.hostname,
                    pathname: session.pathname,
                    startedAt: session.startedAt,
                    primaryRuleId: session.primaryRuleId
                }
                : null,
            ruleCount: tracker.getRules().length
        })
    } catch (error) {
        console.error("extension-status handler error:", error);
        res.send({
            bridge: {
                connected: false,
                passiveMode: false,
                clientId: null,
                browserType: "unknown",
                cachedWsPort: null,
                originOverride: null,
                unsyncedCount: 0
            },
            activeSession: null,
            ruleCount: 0
        })
    }
}

export default handler