import type { PlasmoMessaging } from "@plasmohq/messaging";
import { tracker } from "~background/index";
import type { LiveRule } from "@vinaya/behavior-core";

interface GetRulesResponse {
    rules: Array<LiveRule>
}

const handler: PlasmoMessaging.MessageHandler<void, GetRulesResponse> = async (_req, res) => {
    const rules = tracker.getRules()
    res.send({ rules })
}

export default handler