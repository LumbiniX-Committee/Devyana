import type { PlasmoMessaging } from "@plasmohq/messaging";
import { tracker } from "~background/index";
import { readAllTime, readHostnameTimeForRule } from "~lib/store";


const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
    const rules = tracker.getRules()
    const ruleIds = rules.map(rule => rule.id)

    const stored = await readAllTime(ruleIds)
    const pending = tracker.getTimeAccumulator()

    const totals: Record<string, number> = {}

    for (const id of ruleIds) {
        totals[id] = (stored[id] ?? 0) + (pending[id] ?? 0)
    }

    const breakdownRuleIds = rules
        .filter(rule => rule.behavior.trackHostnames)
        .map(rule => rule.id)

    const hostnameBreakdowns: Record<string, Record<string, number>> = {}

    for (const ruleId of breakdownRuleIds) {
        const storedBreakdown = await readHostnameTimeForRule(ruleId)

        const pendingHostnames = tracker.getHostnameTimeAccumulator()
        const merged = { ...storedBreakdown }

        for (const [compositeKey, ms] of Object.entries(pendingHostnames)) {
            const [rid, hostname] = compositeKey.split("::")
            if (rid === ruleId) {
                merged[hostname] = (merged[hostname] ?? 0) + ms
            }
        }

        hostnameBreakdowns[ruleId] = merged
    }

    res.send({
        totals,
        hostnameBreakdowns,
        activeSession: tracker.getSession()
    })
}

export default handler