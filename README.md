# LifeOS

**Your entire student life. Organized.**

LifeOS is an AI-powered personal command center for students — schoolwork, assignments,
deadlines, goals, tasks, calendar events and study practice in one clean dashboard.
Open it every morning and it tells you what matters.

This repo is a working full-stack MVP: real auth, a real database, a real Canvas
integration, and AI features that run with or without an API key.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router) + TypeScript | One codebase for UI + API. Route Handlers give a clean REST API for the AI endpoints. |
| Database | **Cloud Firestore** | Real-time by default — every open tab updates the moment data changes, with no polling or refetching. |
| Auth | **Firebase Auth** (email + password) | The client SDK holds the session; API routes verify the ID token with the Admin SDK. |
| AI | Pluggable `AIProvider` — **Gemini**, **Claude**, or an offline **heuristic** engine | Every AI feature works with no API key via deterministic parsing. Adding a key upgrades quality. AI only ever sees a snapshot of the user's own LifeOS data. |
| School data | **Canvas LMS** via OAuth 2 | Courses, assignments, due dates and grades sync in. Per-institution developer key. |
| Styling | Tailwind + a small hand-built component system | Consistent design tokens, dark/light mode, no bloat. |
| Charts | Inline SVG components | No heavy chart dependency. |

---

## Getting started

```bash
npm install
cp .env.example .env          # then fill in your Firebase config
npm run dev                   # http://localhost:3000
```

The marketing site runs with no configuration at all. Everything behind login needs
the Firebase keys — without them `/login` shows a "Firebase isn't configured yet"
screen instead of failing at runtime.

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for creating the project, and
[SETUP-MAC.md](SETUP-MAC.md) for running it on a second machine.

### Environment variables

Every key is documented inline in [.env.example](.env.example). The short version:

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | ✅ | Web config from the Firebase console. Safe to expose. |
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | Service-account JSON on one line. **Secret** — server only. |
| `GEMINI_API_KEY` | — | Turns on Gemini for Brain Dump, prioritization, the assistant and card generation. |
| `ANTHROPIC_API_KEY` | — | Same, using Claude. `AI_PROVIDER=auto` prefers Anthropic > Gemini > offline. |
| `CANVAS_*` | — | Canvas OAuth. Leave empty to hide the integration; set `CANVAS_MOCK=1` to develop against fixtures. |
| `SCORECLIMB_ORIGIN` | — | Where SAT Prep's question bank is published. Defaults to the live ScoreClimb site. |

`.env` is gitignored and never leaves your machine.

---

## Architecture

```
src/
  app/
    (marketing)/        Landing page + pricing
    (auth)/             Sign up, log in, forgot password
    onboarding/         Wizard → seeds the initial dashboard
    (app)/              Authenticated shell (sidebar) — dashboard, tasks,
                        brain-dump, calendar, goals, school, grades,
                        practice, podcast, sat/*, analytics, assistant, settings
    api/                Route handlers (JSON, zod-validated, ID-token guarded)
  components/
    ui/                 Design system (button, card, input, modal, badge, …)
    app/                Feature components (task item/editor, charts, panels)
    dashboard/          The full-bleed dashboard experience
    canvas/             Connect / sync / course-picker UI
    sat/                SAT Prep screens (dashboard, runners, bank, …)
    marketing/          Landing page scenes and pricing
  lib/
    ai/                 AIProvider interface, heuristic + Gemini + Claude
                        engines, NLP helpers, priority scoring, context builder
    practice/           Spaced repetition, answer grading, deck parsing
    sat/                SAT Prep rules, exam engine, question-bank loader
    canvas/             OAuth, token crypto, API client, sync
    firebase/           Client SDK, Admin SDK, Firestore schema, auth context
    store/app-data.tsx  One real-time subscription per collection; every
                        mutation in the app goes through here
    validation.ts       zod schemas shared by every endpoint
```

### Data model

Everything lives under the signed-in user, so the security rule is a one-liner:

```
users/{uid}                  profile, prefs, plan, AI usage counters
users/{uid}/tasks/{id}
users/{uid}/goals/{id}       milestones embedded
users/{uid}/courses/{id}
users/{uid}/assignments/{id}
users/{uid}/events/{id}
users/{uid}/alarms/{id}
users/{uid}/decks/{id}       Practice study sets, cards embedded
users/{uid}/focusSessions/{id}
```

Canvas OAuth tokens live outside that subtree in `canvasConnections/{uid}`, which the
client cannot read at all — only the server, via the Admin SDK.

### AI layer (`src/lib/ai`)

`getAI()` returns an `AIProvider`. `LLMProvider` holds the prompts, the strict-JSON
contract and the safety nets; `GeminiProvider` and `AnthropicProvider` only implement
the raw completion call, so both behave identically.

- **`HeuristicProvider`** — deterministic, no network. Splits a brain dump into tasks,
  detects an *explicit* date (never invents one), estimates duration, scores priority,
  and suggests a free slot from the student's schedule. For Practice it lifts cards
  from sentences already shaped like a definition.
- **Hosted providers** — sent the student's LifeOS snapshot and instructions, parse
  strict JSON, and **fall back to the heuristic engine on any error**. A guard strips
  any date the model invented that the source text doesn't support.

The AI is never a general chatbot — `buildContext()` assembles the only data it sees.
Brain Dump and card generation share one metered quota so no user can run up the bill.

### Practice (`src/lib/practice`)

Decks of cards, drilled through four games — Flashcards, Quiz, Match and Recall Rush —
all feeding one spaced-repetition scheduler (`srs.ts`). A card carries an ease factor
and a streak; answering right pushes its next review out, missing brings it back within
the session. `answer.ts` grades typed answers leniently (typos, accents, articles and
keyword recall) without accepting a wrong one. `parse.ts` turns pasted lists or raw
notes into cards.

The pure logic is covered by tests:

```bash
npm test
```

### SAT Prep (`/sat`, `src/lib/sat`)

Full digital SAT and PSAT/NMSQT prep on the College Board's own question bank, built
into LifeOS from [ScoreClimb](https://singular-klepon-be59b4.netlify.app/). It's a
section of the sidebar (under **School → SAT Prep**) and a sphere on the dashboard orbit.

| Page | What it does |
|---|---|
| **Overview** `/sat` | Countdown to your test date, today's goal ring and study time, SAT and PSAT score journeys (start → estimate → target), streak, question of the day for each section, badges and AP scores. Resume cards appear for a paused set or an unfinished exam. |
| **Practice** `/sat/practice` | Build a set by test, section, domain, skill (in College Board's order), difficulty and length. Daily Mix is one click from the overview. |
| **Practice exams** `/sat/exams` | Full-length adaptive SAT or PSAT: four timed modules, a 10-minute break, module 2 routed by module 1 (60%+ → harder), scaled score, domain breakdown and a review of every missed question. Ten numbered library exams per test always draw the same questions, so retakes are comparable. |
| **Review mistakes** `/sat/review` | Everything you got wrong until you get it right, with what you answered. Retry one or the 15 most recent. |
| **Question bank** `/sat/bank` | Every question with its College Board ID, filterable, in the official site's order. Paste teacher-assigned IDs, preview without answers, practise exactly your selection. |
| **Flashcards** `/sat/flashcards` | SAT vocabulary and Latin & Greek roots on Leitner boxes. |
| **Study guides** `/sat/guides` | The math and English guides, topic by topic. |
| **Progress** `/sat/progress` | Predicted score range that narrows with practice, outside exams you've logged, strengths and focus areas by domain and skill, and 28 days of activity. |
| **SAT settings** `/sat/settings` | Test dates, targets, daily goal, AP scores, outside-exam logging, backup/restore, reset, and feedback to the ScoreClimb team. |

The runners work like the real test: two-panel layout, mark for review, cross-out, the
Desmos testing calculator and reference sheet on math, pause and resume. Practice counts
only your first attempt; leaving a set by any route saves it. Question content renders on
a light sheet (LifeOS's own light palette, scoped) because College Board figures are black
lines on a transparent background; everything around it is the normal dark UI.

**How it fits together.** The question bank stays published by ScoreClimb, along with its
weekly College Board sync; `next.config.mjs` proxies `/sat-data/*` to it server-side, so
it's same-origin with no copy of the 36 MB bank in this repo. Progress lives in the
browser under ScoreClimb's own `scoreclimb` key and schema, so **a backup from the
standalone site restores straight into LifeOS** (SAT settings → Restore). Reviews go
through `/api/sat/feedback` to ScoreClimb's existing Netlify form.

The scoring, adaptive routing, XP, streak and badge rules are ported unchanged. Beyond the
unit tests, `npm run test:sat-parity` runs ScoreClimb's original JavaScript side by side
with the port on the real catalog, checking that all 20 library exams draw identical
questions and that scores and recorded state match. It needs ScoreClimb's source on disk
(`SCORECLIMB_DIR`) and skips otherwise.

### Canvas integration (`src/lib/canvas`)

Canvas OAuth is per-institution — each school issues its own developer key. Register
LifeOS as a Developer Key on the target instance with redirect URI
`<NEXT_PUBLIC_APP_URL>/api/canvas/callback`, then set `CANVAS_CLIENT_ID` /
`CANVAS_CLIENT_SECRET`. Access tokens are encrypted at rest and the OAuth state is
signed. Students pick which courses sync; imported assignments are de-duplicated
against what's already there.

---

## Pricing

Two tiers (Free / Student+ $12.99) with real feature gating in
[`lib/plan-limits.ts`](src/lib/plan-limits.ts) — Brain Dumps per week, assistant
questions per day, active goals, courses, decks, analytics history.

**Payments are not implemented.** Upgrading flips the user's plan instantly in demo
mode with no charge. Swap it for a billing provider's checkout session when ready.

---

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Logic tests — practice, search, podcast, SAT |
| `npm run test:sat-parity` | SAT port vs ScoreClimb's original code (needs its source) |
| `npm run firebase:rules` | Deploy `firestore.rules` |
| `npm run firebase:indexes` | Deploy `firestore.indexes.json` |

## Moving to production

1. Deploy the Firestore rules (`npm run firebase:rules`) — they are not applied automatically.
2. Set `NEXT_PUBLIC_APP_URL` to the real origin, and update the Canvas developer key's
   redirect URI to match.
3. Put `FIREBASE_SERVICE_ACCOUNT` and the Canvas secrets in the host's secret store,
   never in the repo.
4. Add a billing provider and replace the demo plan switch.
