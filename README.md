# Vinaya

Vinaya is a desktop application and companion browser extension that reads your everyday browsing behavior through the lens of Buddhist wisdom, helping you recognize unwholesome digital habits and rebuild a more mindful relationship with the internet. Its name comes from the *Vinaya* — the Buddhist code of monastic discipline — reflecting the app's goal of bringing that same structure and self-discipline to modern digital life. Built for *LumbiniX*, a hackathon centered on the theme *"Where Spirituality Meets Innovation"*.

## Buddhist Principles at the Core

Every part of Vinaya is deliberately built around a specific piece of Buddhist teaching, rather than generic productivity theory:

* **The Four Noble Truths (Cattāri Ariyasaccāni)** — the diagnostic frame of the whole app: it identifies *dukkha* (the restlessness/dissatisfaction of mindless browsing), traces it to *taṇhā* (craving for stimulation), and offers a *magga* (path) toward its reduction.
* **The Noble Eightfold Path (Aṭṭhaṅgika Magga)** — the lens the Buddha Engine uses to classify behavior, drawing especially on Right View, Right Action, Right Effort, and Right Mindfulness.
* **The Five Precepts (Pañcasīla)** — the baseline used to flag content: harmful content, deceptive/false content, and compulsive "digital intoxicants" (doom-scrolling, gambling-style sites) are treated as violations of the Precepts.
* **The Three Poisons (Akusala-mūla)** — greed, aversion, and delusion — used as root-cause tags for *why* a browsing session was unwholesome, not just that it was.
* **The Four Right Efforts (Sammappadhāna)** — the exact structure of the Intervention & Nudge System: prevent, abandon, cultivate, and maintain.
* **Sati (Mindfulness)** — the extension's core act: passive, non-judgmental observation of what you actually do online.
* **Anicca (Impermanence)** — the philosophy behind the trend graphs: today's habits are shown as changeable, not fixed.
* **Karma (Cause and Effect)** — the basis of the Digital Karma Score, which reflects the accumulated weight of repeated online actions.
* **Sangha & Kalyāṇa-mittatā (Community & Admirable Friendship)** — the inspiration for the community module, where practitioners support one another's progress.
* **Mettā & Karuṇā (Loving-kindness & Compassion)** — the tone of every nudge and suggestion: corrective, never shaming.

## Solution

Vinaya turns raw browsing data into a practice of ongoing self-reflection, in four steps:

* **Step 1 — Awareness (Extension):** Passively captures the URLs visited, a short description of each page, and time spent — the first act of *Sati*, simply noticing without judgment.
* **Step 2 — Insight (Buddha Engine):** The primary server hands this metadata to the Buddha Engine, a secondary reasoning service that classifies each session as wholesome (*kusala*), neutral, or unwholesome (*akusala*) against the Five Precepts, the Eightfold Path, and the Three Poisons.
* **Step 3 — Reflection (Desktop App):** Results are shown as a color-coded graph and a plain-language breakdown of specific unproductive or harmful actions, in a clean, distraction-free UI.
* **Step 4 — Guidance (The Path):** The app offers personalized suggestions on what to avoid and what to cultivate instead — rooted in the Noble Eightfold Path rather than generic productivity advice.

## Core Features

### For Desktop App Users:
* Interactive browsing history graph, color-coded by wholesome (*kusala*), neutral, and unwholesome (*akusala*) states
* Root-cause breakdown of unproductive sessions, tagged against the Three Poisons — greed, aversion, and delusion
* Personalized guidance drawn from the Noble Eightfold Path (Right Effort, Right Mindfulness, Right View)
* Historical trend view illustrating *Anicca* (impermanence) — a reminder that today's habits are not fixed

### For Browser Extension Users:
* Automatic, passive capture of visited URLs, page descriptions, and time spent per page — the first act of *Sati* (bare attention)
* Zero manual logging, so the practice of noticing begins without added effort or friction
* Lightweight footprint that runs quietly in the background, observing without interrupting
* Secure transmission of browsing metadata to the primary server for interpretation

### Data Sync & Verification System:
* Unique per-device authentication linking the extension installation to a user's desktop account
* In the spirit of Right Speech's emphasis on truthfulness
* Approval layer on the primary server validating payloads before they reach the Buddha Engine

### Buddha Engine Infrastructure:
* Interactive dashboard reflecting real-time analysis against the Five Precepts and the Eightfold Path
* Built to process continuous, high-volume streams of URL and session metadata
* Strategic pattern-tagging (doom-scrolling, mindless surfing, focused research) rooted in identifying which of the Three Poisons — if any — is driving the behavior

## Future Development

### 1. Digital Karma Scoring Algorithm
Grounded in the principle of karma — that repeated action accumulates weight over time. It analyzes:
* Time spent per website and content category
* Frequency and recency of visits to flagged or unwholesome sites
* Content type and context (educational/wholesome vs. reactive/unwholesome)
* Time-of-day and session-length patterns associated with mindless browsing

This gives users a single, evolving score that reflects the accumulated karma of their digital habits and their progress over time.

### 2. Real-Time Intervention & Nudge System
Structured directly around the Four Right Efforts (*Sammappadhāna*):
* **Prevent** — detection of an unwholesome pattern before it fully takes hold
* **Abandon** — gentle, in-context reminders drawn from Buddhist teaching, encouraging release of a pattern already underway
* **Cultivate** — adaptive "mindful pause" prompts that nurture a wholesome alternative in the moment
* **Maintain** — weekly reflection summaries that reinforce wholesome habits already established

Delivered in the spirit of *Mettā* (loving-kindness), this system aims to reduce compulsive browsing without relying on harsh blocking or shame-based tactics.

### 3. Sangha Community Module
Named for the *Sangha* — the Buddhist community of practitioners who support one another on the path:
* Shared reflection and meditation prompts tied to personal browsing insights
* Guided digital detox based on the Five Precepts
* Integration with meditation timers and mindfulness reminders

## Technology Stack

**Desktop App**
* [Framework / e.g., Tauri + React]
* [UI Component Library]
* [Charting / Graph Library / e.g., apexcharts]
* [Styling / e.g., TailwindCSS]

**Browser Extension**
* [Extension Framework / e.g., Chrome Extension Manifest V3]
* [Language / e.g., JavaScript, TypeScript]

**Backend**
* [Runtime / e.g., Tauri]
* [Server Framework / e.g., Tauri and Rust]
* [Database / e.g., Sql]
* [ORM / e.g., Prisma]

**Buddha Engine (AI Classification)**
* [LLM (Qwen model 2.5 7b-Instruct)]
* [Transformers, Outlines, Pydantic, Torch]

## Project Structure
```text
ai/
apps/
├── website/          # Landing page for the application
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...etc
│
├── extension/             # Browser extension that captures browsing metadata
│   ├── src/
│   └── ...etc
│
├── frontend/             # Tauri-based desktop application (UI, graphs, suggestions)
│   ├── src/
│   ├── src-tauri/
│   └── ...etc
│
scripts/
packages/
```