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
                        practice, analytics, assistant, settings
    api/                Route handlers (JSON, zod-validated, ID-token guarded)
  components/
    ui/                 Design system (button, card, input, modal, badge, …)
    app/                Feature components (task item/editor, charts, panels)
    dashboard/          The full-bleed dashboard experience
    canvas/             Connect / sync / course-picker UI
    marketing/          Landing page scenes and pricing
  lib/
    ai/                 AIProvider interface, heuristic + Gemini + Claude
                        engines, NLP helpers, priority scoring, context builder
    practice/           Spaced repetition, answer grading, deck parsing
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
| `npm test` | Practice logic tests |
| `npm run firebase:rules` | Deploy `firestore.rules` |
| `npm run firebase:indexes` | Deploy `firestore.indexes.json` |

## Moving to production

1. Deploy the Firestore rules (`npm run firebase:rules`) — they are not applied automatically.
2. Set `NEXT_PUBLIC_APP_URL` to the real origin, and update the Canvas developer key's
   redirect URI to match.
3. Put `FIREBASE_SERVICE_ACCOUNT` and the Canvas secrets in the host's secret store,
   never in the repo.
4. Add a billing provider and replace the demo plan switch.
