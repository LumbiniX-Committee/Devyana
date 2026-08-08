import type { PlasmoMessaging } from "@plasmohq/messaging";
import { tracker } from "~background/index";
import type { PageMetaMessage } from "@vinaya/behavior-core";


const handler: PlasmoMessaging.MessageHandler<PageMetaMessage, void> = (req, res) => {
    const { meta, url } = req.body ?? {}
    const tabId = req.sender.tab?.id

    if (tabId && meta && url) {
        tracker.receivePageMeta(tabId, meta, url)
    }

    res.send()
}

export default handler