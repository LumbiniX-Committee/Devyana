import type { LiveRule } from "@vinaya/behavior-core"

export function resolveRules(
    matchedIds: Array<string>,
    rules: Array<LiveRule>
): Array<string> {

    const map = new Map(
        rules.map(rule => [rule.id, rule])
    )

    let active = [...matchedIds]
    active = active.filter(id => {
        const rule = map.get(id)
        return rule?.behavior.emit !== "never"
    })

    if (!active.length) return []

    const exclusive = active.filter(id => {
        return map.get(id)?.behavior.exclusive
    })

    if (exclusive.length) {
        exclusive.sort((a, b) =>
            (map.get(b)?.behavior.priority ?? 0) -
            (map.get(a)?.behavior.priority ?? 0)
        )

        return [exclusive[0]]
    }

    const suppressed = new Set<string>()

    for (const id of active) {
        const rule = map.get(id)

        for (const target of rule?.behavior.suppress ?? []) {
            suppressed.add(target)
        }
    }

    active = active.filter(id => !suppressed.has(id))

    const categoryWinners = new Map<string, string>()

    for (const id of active) {
        const rule = map.get(id)

        const category = rule?.behavior.category

        if (!category) continue

        const current = categoryWinners.get(category)

        if (!current) {
            categoryWinners.set(category, id)
            continue
        }

        const currentPriority =
            map.get(current)?.behavior.priority ?? 0

        const nextPriority =
            rule?.behavior.priority ?? 0

        if (nextPriority > currentPriority) {
            categoryWinners.set(category, id)
        }
    }

    active = active.filter(id => {
        const category = map.get(id)?.behavior.category

        if (!category) return true

        return categoryWinners.get(category) === id
    })

    const normal = active.filter(id => {
        return map.get(id)?.behavior.emit !== "fallback"
    })

    if (normal.length) {
        active = normal
    }

    return [...new Set(active)]
}