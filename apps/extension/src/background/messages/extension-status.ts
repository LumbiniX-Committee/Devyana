import type { PlasmoMessaging } from "@plasmohq/messaging";
import { desktopBridge } from "~lib/desktop-bridge";
import { tracker } from "~background/index";

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
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
}

export default handler