# LifeOS

**Your entire student life. Organized.**

LifeOS is an AI-powered personal command center for students — schoolwork, assignments,
deadlines, goals, tasks, calendar events and personal projects in one clean dashboard.
Open it every morning and it tells you what matters.

This repo is a working full-stack MVP: real auth, a real database, a real API, and AI
features that actually run (with **no API key required**).

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router) + TypeScript | One codebase for UI + API. Server Components read the DB directly for fast pages; Route Handlers give a clean REST API for mutations. |
| Database | **Prisma** ORM + **SQLite** (dev) | Zero-config locally. Standard SQL — point `DATABASE_URL` at Postgres for production, no code changes. |
| Auth | Hand-rolled: **bcrypt** + signed **JWT** (`jose`) in an httpOnly cookie | Secure, no third-party lock-in, secret from env. `middleware.ts` gates the app. |
| AI | Pluggable `AIProvider` — **Heuristic** engine (default) or **Anthropic/Claude** (`ANTHROPIC_API_KEY`) | Every AI feature works offline via deterministic parsing + scoring. Adding the key upgrades quality. AI only ever sees a snapshot of the user's own LifeOS data. |
| Styling | Tailwind + a small hand-built component system | Consistent design tokens, dark/light mode, no bloat. |
| Charts | Inline SVG components | No heavy chart dependency. |

---

## Getting started

```bash
npm install
cp .env.example .env          # then edit AUTH_SECRET
npm run setup                 # prisma db push + seed a demo account
npm run dev                   # http://localhost:3000
```

**Demo login:** `demo@lifeos.app` / `demolifeos`

### Environment variables

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `file:./dev.db` for SQLite, or a Postgres URL. |
| `AUTH_SECRET` | ✅ | Long random string. `openssl rand -base64 48`. |
| `ANTHROPIC_API_KEY` | — | If set, Brain Dump / prioritization / assistant use Claude. If not, the heuristic engine runs. |
| `ANTHROPIC_MODEL` | — | Defaults to `claude-sonnet-5`. |
| `CANVAS_ENABLED`, `INFINITE_CAMPUS_ENABLED` | — | Stay `false` until real API credentials exist. |

---

## Architecture

```
src/
  app/
    (marketing)/        Landing page + pricing
    (auth)/             Sign up, log in, forgot / reset password
    onboarding/         5-step wizard → generates the initial dashboard
    (app)/              Authenticated shell (sidebar) — dashboard, tasks,
                        brain-dump, calendar, goals, school, analytics,
                        assistant, settings
    api/                Route handlers (REST-ish, JSON, zod-validated)
  components/
    ui/                 Design system (button, card, input, modal, badge, …)
    app/                Feature components (task item/editor, charts, panels)
    marketing/          Pricing table
  lib/
    ai/                 AIProvider interface, heuristic + anthropic engines,
                        NLP helpers, priority scoring, scheduling, context builder
    auth/               password hashing, session (JWT), route guards
    integrations/
      school/           SchoolIntegration base + Canvas / Infinite Campus
                        subclasses (disabled — "coming soon")
    analytics.ts        Productivity metrics
    validation.ts       zod schemas shared by every endpoint
prisma/
  schema.prisma         Full data model
  seed.ts               Demo account with realistic data
```

### AI layer (`src/lib/ai`)

`getAI()` returns an `AIProvider`:

- **`HeuristicProvider`** — deterministic. Splits a brain dump into fragments, normalizes
  each into an action-oriented task, detects an *explicit* date (never invents one),
  estimates duration by task type, scores priority, and suggests a free slot pulled from
  the student's onboarding schedule. `prioritize()` and `assist()` use a transparent
  scoring model (`lib/ai/score.ts`) over deadlines, goals, course load and quick wins.
- **`AnthropicProvider`** — used only when `ANTHROPIC_API_KEY` is present. Sends the
  student's LifeOS data snapshot + instructions, parses strict JSON, and **falls back to
  the heuristic engine on any error**. A post-processing guard strips any date the model
  invented that the source text doesn't support.

The AI is never a general chatbot — `buildContext()` assembles the *only* data it sees.

### School integrations (`src/lib/integrations/school`)

```
SchoolIntegration (abstract)
├── CanvasIntegration          descriptor + isConfigured() → status "coming_soon"
└── InfiniteCampusIntegration  beginAuth()/sync() throw NotYetAvailableError
```

- No fake "connected" state. No collection of school usernames/passwords.
- The `Connection` table and `provider` / `externalId` columns on `Course`,
  `Assignment` and `CalendarEvent` already exist, so wiring real OAuth later is
  purely additive.
- Calendar sync (Google / Microsoft) is declared the same way and marked *coming soon*.

### Auth flow

`POST /api/auth/signup|login` → bcrypt verify → `createSession()` signs a JWT →
httpOnly `SameSite=Lax` cookie. `middleware.ts` verifies it on every protected route
(edge-safe via `jose`). Password reset issues a hashed, expiring token; with no mail
provider configured the link is returned in dev so the flow is testable.

---

## Pricing

Three tiers (Free / Pro $7.99 / Student+ $12.99) with real feature gating
(`lib/ai/PLAN_LIMITS` — e.g. Free = 3 Brain Dumps/day, no analytics history).

**Payments are not implemented.** `POST /api/plan` flips the user's plan instantly in
demo mode with no charge. Swap it for a billing-provider checkout session when ready.

---

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate` + production build |
| `npm run setup` | `prisma db push` + seed |
| `npm run db:seed` | Re-seed the demo account |
| `npm run db:studio` | Prisma Studio |

## Moving to production

1. Set `DATABASE_URL` to Postgres, change `provider` in `schema.prisma` to `postgresql`, run `prisma migrate deploy`.
2. Set a strong `AUTH_SECRET`.
3. Add a mail provider for password resets (`lib/auth/forgot-password` route).
4. Add a billing provider and replace `/api/plan`.
5. Implement `beginAuth()` / `completeAuth()` / `sync()` on a `SchoolIntegration` subclass once you have official API access.
