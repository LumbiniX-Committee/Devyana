import type { PlasmoMessaging } from "@plasmohq/messaging";
import { pruneLog } from "~lib/store";

interface PruneLogResponse {
    ok: boolean
    error?: string
}

const handler: PlasmoMessaging.MessageHandler<void, PruneLogResponse> = async (_req, res) => {
    try {
        await pruneLog()
        res.send({ ok: true })
    } catch (error) {
        res.send({ ok: false, error: String(error) })
    }
}

export default handler