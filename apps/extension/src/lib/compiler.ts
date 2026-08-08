import type { FieldMatcher, LiveCondition, LiveRule, MatchSpec, ParsedUrl, Rule, UrlCondition } from "@vinaya/behavior-core";

const normalizeHost = (hostname: string): string => hostname.replace(/^www\./i, "").toLowerCase()

export function parseUrl(raw: string): ParsedUrl | null {
    try {
        const url = new URL(raw)
        return { hostname: normalizeHost(url.hostname), pathname: url.pathname, search: url.search }
    } catch {
        return null
    }
}

// from online 
function globToRegex(globPattern: string): RegExp {
    const wildcardExtensionMatch = globPattern.match(/^\*\.(.+)$/);

    if (wildcardExtensionMatch) {
        const fileExtension = wildcardExtensionMatch[1];
        const escapedFileExtension = fileExtension.replace(
            /[.+^${}()|[\]\\]/g,
            "\\$&"
        );

        return new RegExp(`^(.*\\.)?${escapedFileExtension}$`, "i");
    }

    let escapedPattern = globPattern.replace(
        /[.+^${}()|[\]\\]/g,
        "\\$&"
    );
    const doubleWildcardToken = "\x00";

    escapedPattern = escapedPattern
        .replace(/\*\*/g, doubleWildcardToken)
        .replace(/\*/g, "[^/]*")
        .replace(new RegExp(doubleWildcardToken, "g"), ".*")
        .replace(/\?/g, "[^/]");

    return new RegExp(`^${escapedPattern}$`, "i");
}

function compilerMatcher(pattern: string, mode: "hostname" | "pathname" | "search"): FieldMatcher {

    // Regex
    const regexParts = pattern.match(/^\/(.+)\/([gimsuy]*)$/)
    if (regexParts) {
        try {
            const regex = new RegExp(regexParts[1], regexParts[2])
            return value => regex.test(value)
        } catch {
            console.warn(`🐸 Invalid regex in rule: "${pattern}"`)
            return () => false
        }
    }

    // Glob
    if (pattern.includes("*") || pattern.includes("?")) {
        const regex = globToRegex(pattern)
        return value => regex.test(value)
    }

    // Plain string
    const normalizedValue = mode === "hostname" ? normalizeHost(pattern) : pattern

    switch (mode) {
        case "hostname":
            return value => value === normalizedValue

        case "pathname":
            const withSlash = normalizedValue.endsWith("/") ? normalizedValue : `${normalizedValue}/`
            return value => value === normalizedValue || value.startsWith(withSlash)

        case "search":
            return value => value.includes(normalizedValue)
    }


}

function compileCondition(condition: UrlCondition): LiveCondition {
    return {
        hostname: condition.hostname ? compilerMatcher(condition.hostname, "hostname") : null,
        pathname: condition.pathname ? compilerMatcher(condition.pathname, "pathname") : null,
        search: condition.search ? compilerMatcher(condition.search, "search") : null
    }
}

function resolveSpecs(specs: Array<MatchSpec>, index: Map<string, Rule>, visited = new Set<string>()): Array<LiveCondition> {
    const out: Array<LiveCondition> = []

    for (const spec of specs) {
        if ("ref" in spec) {
            if (visited.has(spec.ref)) {
                console.warn(`Circular ref: ${spec.ref}`)
                continue
            }
            const ref = index.get(spec.ref)

            if (!ref) {
                console.warn(`Ref not found: ${spec.ref}`)
                continue
            }

            const refSpecs = Array.isArray(ref.match) ? ref.match : [ref.match]

            out.push(...resolveSpecs(refSpecs, index, new Set([...visited, spec.ref])))
        } else {
            out.push(compileCondition(spec))
        }
    }

    return out
}

export function compileRules(rawRules: Array<Rule>): Array<LiveRule> {
    const index = new Map(rawRules.map(rule => [rule.id, rule]))

    return rawRules.map(rule => {
        const specs = Array.isArray(rule.match) ? rule.match : [rule.match]
        const metaFields = rule.meta ?? []
        const include = rule.include ?? []

        return {
            id: rule.id,
            conditions: resolveSpecs(specs, index),
            metaFields,
            include,
            needsMeta: metaFields.length > 0 || include.length > 0,
            behavior: {
                emit: rule.behavior?.emit ?? "always",
                priority: rule.behavior?.priority ?? 0,
                suppress: rule.behavior?.suppress ?? [],
                exclusive: rule.behavior?.exclusive ?? false,
                batchWith: rule.behavior?.batchWith ?? [],
                category: rule.behavior?.category ?? "",
                trackHostnames: rule.behavior?.trackHostnames ?? false,
                intervention: rule.behavior?.intervention ?? null
            }
        }
    })
}

export function matchRules(
    url: ParsedUrl,
    rules: Array<LiveRule>,
): Array<string> {
    const matched: Array<string> = []

    for (const rule of rules) {
        for (const condition of rule.conditions) {
            if (
                (!condition.hostname || condition.hostname(url.hostname)) &&
                (!condition.pathname || condition.pathname(url.pathname)) &&
                (!condition.search || condition.search(url.search))
            ) {
                matched.push(rule.id)
                break
            }
        }
    }

    return matched
}