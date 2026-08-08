import { sendToBackground } from "@plasmohq/messaging";
import type { PlasmoCSConfig } from "plasmo";
import { extractMeta } from "~lib/parser";
import { SPA_NAV_DEBOUNCE_MS, type MetaField, type PageMetaMessage, type RequestMetaMessage } from "@vinaya/behavior-core";

export const config: PlasmoCSConfig = {
    matches: ["<all_urls>"],
    run_at: "document_idle",
}

let currentFields: Array<MetaField> = ["title", "description", "keywords"]
let currentTerms: Array<string> = []

async function pushMeta(): Promise<void> {
    const meta = extractMeta(currentFields, currentTerms);
    const body: PageMetaMessage = {
        meta, url: location.href
    }

    try {
        await sendToBackground<PageMetaMessage, void>({
            name: "page-meta",
            body
        })
    } catch (error) {

    }
}

chrome.runtime.onMessage.addListener((msg: RequestMetaMessage, _sender, sendResponse) => {
    if (msg.type !== "REQUEST_META") return false
    if (msg.metaFields?.length) currentFields = msg.metaFields
    if (msg.includeTerms?.length) currentTerms = msg.includeTerms

    const meta = extractMeta(currentFields, currentTerms)
    sendResponse(meta)

    return false
})

let lastHref = location.href
let navDebounce: ReturnType<typeof setTimeout> | null = null

const observer = new MutationObserver(() => {
    if (location.href === lastHref) return

    lastHref = location.href


    if (navDebounce) clearTimeout(navDebounce)

    navDebounce = setTimeout(() => {
        pushMeta()
        navDebounce = null
    }, SPA_NAV_DEBOUNCE_MS);
})

observer.observe(document, {
    subtree: true,
    childList: true
})

pushMeta()