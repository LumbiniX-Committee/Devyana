import type { Rule } from "@vinaya/behavior-core";

export const DEFAULT_RULES: Array<Rule> = [
    {
        id: "youtube",
        match: { hostname: "youtube.com" },
        behavior: { emit: "never" }
    },
    {
        id: "instagram",
        match: { hostname: "instagram.com" },
        behavior: { emit: "never" }
    },
    {
        id: "dopamine_intox",
        match: [
            { ref: "youtube" },
            { ref: "instagram" }
        ],
        behavior: { priority: 100 },
        
    },
    {
        id: "youtube_shorts",
        match: {
            hostname: "youtube.com",
            pathname: "/shorts"
        },
        behavior: {
            category: "youtube",
            priority: 200,
            suppress: ["dopamine_intox", "youtube"]
        }
    },
    {
        id: "deep_work",
        match: { hostname: "linear.app" },
        behavior: { exclusive: true }
    },
    {
        id: "other",
        match: { hostname: "/.*/" },
        behavior: { emit: "fallback", trackHostnames: true }
    }
]