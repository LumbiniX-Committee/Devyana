import type { MetaField, PageMeta } from "@vinaya/behavior-core";

export function extractMeta(metaFields: Array<MetaField>, includeTerms: Array<string>): PageMeta {
    const result: PageMeta = {}

    const getMeta = (attribute: string): string | undefined => {
        return document.querySelector<HTMLMetaElement>(`meta[name="${attribute}"]`)?.content || document.querySelector<HTMLMetaElement>(`meta[property="${attribute}"]`)?.content || undefined
    }

    for (const field of metaFields) {
        switch (field) {
            case "title":
                result.title = document.title || undefined
                break;

            case "description":
                result.description = getMeta("description") ?? getMeta("og:description") ?? undefined
                break;

            case "keywords":
                const raw = getMeta("keywords")
                result.keywords = raw ? raw.split(",").map(keyword => keyword.trim()).filter(Boolean) : undefined
                break;

            default:
                result[field] = getMeta(field)
        }
    }

    if (includeTerms.length) {
        const corpus = [
            result.title as string | undefined,
            result.description as string | undefined,
            Array.isArray(result.keywords) ? result.keywords.join(" ") : undefined
        ]
            .filter((x): x is string => Boolean(x))
            .join(" ")
            .toLowerCase()

        if (corpus) {
            const matched = includeTerms.filter(x => corpus.includes(x.toLowerCase()))

            if (matched.length) result.matchedTerms = matched
        }
    }

    return result
}