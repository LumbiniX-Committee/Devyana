import type { PlasmoMessaging } from "@plasmohq/messaging";
import type { Rule } from "@vinaya/behavior-core";
import { tracker } from "~background/index";

const handler: PlasmoMessaging.MessageHandler = (req, res) => {
    const rules = req.body?.rules as Array<Rule> | undefined

    if (!Array.isArray(rules)) {
        res.send({ ok: false, error: "Expected body.rules to be an array" })
        return
    }

    tracker.updateRules(rules)

    res.send({ ok: true })
}

export default handler