import type { PlasmoMessaging } from "@plasmohq/messaging";
import { tracker } from "~background/index";
import type { InterventionTaskType } from "@vinaya/behavior-core";
import { parseUrl } from "~lib/compiler";

interface TriggerInterventionRequest {
    tabId: number;
    taskType: InterventionTaskType;
    params?: Record<string, unknown>;
    durationSec?: number;
}

interface TriggerInterventionResponse {
    ok: boolean;
    error?: string;
}

const handler: PlasmoMessaging.MessageHandler<TriggerInterventionRequest, TriggerInterventionResponse> = async (req, res) => {
    const { tabId, taskType, params, durationSec } = req.body ?? {};

    if (!tabId || !taskType) {
        res.send({ ok: false, error: "Missing tabId or taskType" });
        return;
    }

    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab) {
            res.send({ ok: false, error: "Tab not found" });
            return;
        }

        const rawUrl = tab.url || tab.pendingUrl;
        if (!rawUrl) {
            res.send({ ok: false, error: "Tab has no URL" });
            return;
        }

        if (rawUrl.startsWith("chrome://") || rawUrl.startsWith("chrome-extension://") || rawUrl.startsWith("edge://") || rawUrl.startsWith("about:")) {
            res.send({ ok: false, error: "Cannot inject into browser pages" });
            return;
        }

        const url = parseUrl(rawUrl);
        if (!url) {
            res.send({ ok: false, error: "Invalid URL" });
            return;
        }

        const result = await tracker.forceIntervention(tabId, {
            taskType,
            params,
            durationSec: durationSec ?? 30,
            tasks: []
        });

        res.send(result.ok ? { ok: true } : result);
    } catch (error) {
        res.send({ ok: false, error: String(error) });
    }
};

export default handler
