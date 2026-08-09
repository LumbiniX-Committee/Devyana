#!/usr/bin/env node
/**
 * Vinaya mock Intelligence Layer.
 *
 * Runs a tiny HTTP server that stands in for the three "AI" endpoints the
 * desktop app calls:
 *   POST /classify          -> { category, confidence, reason }
 *   POST /behavior/update   -> behavior graph (echo of what was sent + insight)
 *   POST /behavior/init     -> fresh empty graph
 *   POST /suggest           -> { suggestions: [...] }
 *
 * Deterministic hostname->category mapping, so demos are fully repeatable.
 * Zero dependencies (Node http only). Start with:
 *   node scripts/mock-ai.js
 */

const http = require("node:http")

const PORT = Number(process.env.MOCK_AI_PORT || 8787)

/** Deterministic hostname -> category. JSON-serialized at startup. */
const CATEGORY = {
  "youtube.com": { "/shorts": "dopamine_shorts", default: "learning" },
  "github.com": "coding",
  "docs.rs": "writing",
  "coursera.org": "learning",
  "wikipedia.org": "reading",
  "figma.com": "deep_work",
  "instagram.com": "social_media",
  "steam.com": "gaming",
  "amazon.com": "shopping",
}

function classify(body) {
  const hostname = String(body.hostname || "").toLowerCase()
  const pathname = String(body.pathname || "")

  const entry = CATEGORY[hostname]
  if (typeof entry === "string") {
    return { category: entry, confidence: 0.9, reason: `known hostname ${hostname}` }
  }
  if (entry && typeof entry === "object") {
    for (const [prefix, category] of Object.entries(entry)) {
      if (prefix !== "default" && pathname.startsWith(prefix)) {
        return { category, confidence: 0.85, reason: `path match ${prefix}` }
      }
    }
    return { category: entry.default, confidence: 0.8, reason: `known host ${hostname}` }
  }

  // Heuristics fallback so arbitrary browsing still "works".
  if (hostname.includes("youtube")) return { category: "learning", confidence: 0.7, reason: "youtube heuristic" }
  if (hostname.includes("instagram") || hostname.includes("tiktok")) return { category: "social_media", confidence: 0.8, reason: "social heuristic" }
  if (hostname.includes("netflix") || hostname.includes("twitch")) return { category: "entertainment", confidence: 0.8, reason: "entertainment heuristic" }
  if (hostname.includes("amazon") || hostname.includes("ebay")) return { category: "shopping", confidence: 0.8, reason: "shopping heuristic" }
  return { category: "productive", confidence: 0.6, reason: "generic productive fallback" }
}

function buildGraphUpdate(sessions) {
  const byCategory = {}
  let totalMs = 0
  for (const s of Array.isArray(sessions) ? sessions : []) {
    const category = s.aiCategory || "unlabeled"
    byCategory[category] = byCategory[category] || { sessions: 0, minutes: 0 }
    byCategory[category].sessions += 1
    byCategory[category].minutes += Math.round((s.durationMs || 0) / 60000)
    totalMs += s.durationMs || 0
  }

  return {
    model: "vinaya-mock-v1",
    at: new Date().toISOString(),
    nodeId: "mock-node",
    summary: {
      totalSessions: (Array.isArray(sessions) ? sessions.length : 0),
      totalMinutes: Math.round(totalMs / 60000),
      byCategory
    },
    insights: [
      "demo: deterministic hostname mapping",
      "run the demo harness to refresh this graph"
    ],
    recommendedConstraints: []
  }
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = ""
    req.on("data", (chunk) => {
      raw += chunk
    })
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(payload)
}

async function route(req, res) {
  const method = req.method || "GET"
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`)
  const path = url.pathname

  if (method === "GET" && (path === "/" || path === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("Vinaya mock AI layer is up. POST /classify, /behavior/update, /behavior/init, /suggest\n")
    return
  }

  if (method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" })
    return
  }

  const body = await readJson(req)

  switch (path) {
    case "/classify": {
      const result = classify(body)
      console.log("[classify]", body.hostname, "->", result.category)
      sendJson(res, 200, result)
      return
    }

    case "/behavior/update": {
      console.log("[behavior/update] sessions:", Array.isArray(body.sessions) ? body.sessions.length : 0)
      sendJson(res, 200, buildGraphUpdate(body.sessions))
      return
    }

    case "/behavior/init": {
      console.log("[behavior/init] userId:", body.userId || "-")
      sendJson(res, 200, { status: "ok", node: "mock-node", graph: null })
      return
    }

    case "/suggest": {
      console.log("[suggest] userId:", body?.profile?.userId || "-")
      sendJson(res, 200, {
        suggestions: [
          {
            title: "Read the chapter you opened, then summarize it",
            description: "Coursera bookmark: 20 focused minutes before anything else.",
            reason: "learning"
          },
          {
            title: "Ship one small GitHub task",
            description: "Close the smallest open issue to keep momentum.",
            reason: "coding"
          },
          {
            title: "Restructure your morning around deep work",
            description: "Figma sessions cluster earliest — protect that window.",
            reason: "deep_work"
          }
        ]
      })
      return
    }

    default:
      sendJson(res, 404, { error: `no such endpoint ${path}` })
  }
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res)
  } catch (err) {
    console.error("[mock-ai] error:", err)
    sendJson(res, 500, { error: String(err) })
  }
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Vinaya mock AI layer listening on http://127.0.0.1:${PORT}`)
  console.log("Endpoints: POST /classify, /behavior/update, /behavior/init, /suggest")
})