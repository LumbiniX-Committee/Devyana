# Viyana Verification Run-Sheet (30 min)

Everything below should be **green** before you hand the laptop to a judge.

---

## 0. Prerequisites (one-time)

```bash
# 1. Rust toolchain
rustup default stable

# 2. Node (for mock AI + extension build)
corepack enable pnpm

# 3. Frontend deps
cd apps/frontend && pnpm install && cd ../..

# 4. Extension deps
cd apps/extension && pnpm install && cd ../..

# 5. (Optional) packaged Tauri build for the judge machine
cd apps/frontend && cargo tauri build && cd ../..
```

---

## 1. Cold start from zero (10 min)

```bash
# Terminal A — Mock AI layer (port 8787)
cd <repo-root>
node scripts/mock-ai.js

# Terminal B — Tauri dev (frontend + desktop backend)
cd apps/frontend
cargo tauri dev

# Terminal C — Extension dev (HMR on manifest change)
cd apps/extension
pnpm dev
```

Wait for:
- Terminal A: `Viyana mock AI layer listening on http://127.0.0.1:8787`
- Terminal B: the Tauri window opens, frontend hot-reload ready.
- Terminal C: `plasmo dev` prints the extension ID → load it in Chrome
  `chrome://extensions` ▸ Developer mode ▸ Load unpacked ▸ `apps/extension/.plasmo`

---

## 2. Automated demo harness (3 min)

1. In the Tauri window, click the **Debug** link in the top nav (or navigate to `/debug`).
2. Press **Run demo flow**.  
   The four steps execute:
   1. **Configure AI** — points the four Intelligence-Layer URLs at `http://127.0.0.1:8787`.
   2. **Seed data** — inserts 10 deterministic sessions (5 days, 6 productive / 4 distracting).
   3. **Batch classify** — triggers the AI batcher; every session gets a `category`.
   4. **Read status** — shows the AI health object (classify/batch success counts).

   All green ticks + a JSON payload at the bottom means the full pipeline ran.

---

## 3. Health page (2 min)

Open **/health** (link in Debug page footer or navigate directly).

| Check | Expected |
|-------|----------|
| database | `SELECT 1 ok` |
| websocket_server | `port 7423 bound` (or whatever the port is) |
| ai_reachable | `responded with HTTP 200` |
| profile_exists | `onboarding completed` |
| latest_session | `found, processed_for_graph=1` |

All five **ALL SYSTEMS GO**.

---

## 4. Database inspector (2 min)

Open **/debug/db**. Table shows the 20 most recent sessions.

Columns to verify:

| Column | What you should see after the demo |
|--------|------------------------------------|
| Site | `youtube.com`, `github.com`, … |
| AI category | `learning`, `coding`, `dopamine_shorts`, … (never “pending”) |
| Graph | **yes** for every row that has a category |

No rows = seed step failed.

---

## 5. Profile inspector (1 min)

Open **/debug/profile**.

- Row exists (`id`, `gender`, `age`, `profession`, `goals` JSON).
- Updated-at is recent (within the demo run).

---

## 6. Extension popup debug panel (1 min)

Click the extension icon in Chrome.

| Item | Expected |
|------|----------|
| Desktop WS | **Connected** (green dot) |
| Cached port | 7423 (or whatever the Tauri WS printed) |
| Passive mode | **no** |
| Unsynced events | 0 |
| Active session | hostname + pathname if you have a tab open |
| Rule count | ≥ 8 (default rules) |

Press **Send test event** → toast reads:
> “Sent over a live WebSocket… check the desktop log for: Ping received from extension (ack sent).”

In the Tauri dev console you should see the line:
```
Ping received from extension (ack sent)
```

---

## 7. Packaged build sanity (5 min)

```bash
cd apps/frontend
cargo tauri build   # produces apps/frontend/src-tauri/target/release/bundle/...
```

Run the built `.exe` (Windows) / `.app` (macOS) / `.AppImage` (Linux).  
Repeat **Health page**, **Debug → Run demo flow**, **Extension popup → Send test event**.  
All green = judge-ready.

---

## 8. Quick failure triage

| Symptom | Where to look |
|---------|---------------|
| WS port not found | `apps/frontend/src-tauri/src/websocket/server.rs` bind address / firewall |
| AI health `classify` fails | `scripts/mock-ai.js` running on 8787? CORS? check `tracing` logs in Terminal B |
| Extension “Disconnected” | Chrome `chrome://extensions` ▸ reload extension; Tauri WS must be up |
| Seed demo “0 sessions” | `configure_mock_ai` succeeded? check `settings.ai_classify_url` in Debug → AI status |
| Build `cargo tauri build` fails | Run `cargo check` in `apps/frontend/src-tauri` first |

---

## 9. Reset to clean state (for repeat demos)

```bash
# Nuke localStorage + DB + extension storage
cd apps/frontend/src-tauri
rm -f viyana.db viyana.db-wal viyana.db-shm
# In Chrome: right-click extension ▸ remove, then re-load unpacked
```

Or open **/debug** and press **Run demo flow** again — the seed command `DELETE FROM sessions WHERE client_id = 'seed-demo'` clears previous runs automatically.

---

### TL;DR for judges

1. Terminal A: `node scripts/mock-ai.js`
2. Terminal B: `cd apps/frontend && cargo tauri dev`
3. Load extension from `apps/extension/.plasmo`
4. Tauri window → **/debug** → **Run demo flow** (4 steps, ~8 s)
5. **/health** — all green
6. **/debug/db** — 20 rows, every one has a teal `AI category` badge
7. Extension popup → **Send test event** → desktop log shows “Ping received…”
8. Hand over the laptop.

*End of run-sheet.*