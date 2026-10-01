# LifeOS

Next.js 15 (App Router) + React 19 + Tailwind 3 + Firebase (auth + Firestore). 3D via three / @react-three/fiber. Icons: lucide-react. Deployed to Vercel (manual CLI deploys).

Route groups: `src/app/(app)` (signed-in app, gated in `(app)/layout.tsx`), `(auth)`, `(marketing)`, `onboarding`, `api`.

## Design system — build on it, don't replace it

LifeOS has a premium, modern, clean identity: **dark-only, deep green-black surfaces, a green glow accent, glassy cards.** Any UI work extends this; never introduce a second visual language for one page.

**Tokens** live in `src/app/globals.css` (`:root`, HSL triplets) and are mapped in `tailwind.config.ts`. Use the semantic classes (`bg-card`, `text-muted-foreground`, `border-border`, `text-primary`, `bg-success`, …); don't hard-code hex values in components.
- Dark is the only theme (`color-scheme: dark`). No light-mode variants.
- Accent = `--glow` (green, `152 70% 48%`) used through `shadow-glow-sm | glow | glow-lg`, rings, and hover borders.
- `--g-*` gradient stops are deliberately *dark* greens. `bg-gradient-brand` / `bg-gradient-ai` are subtle fills, not bright ones.
- Radius base `--radius: 0.9rem`; cards are `rounded-2xl`, buttons are `rounded-full`.
- Font: Inter via `next/font` (`--font-sans`) with `cv02 cv03 cv04 cv11 ss01` features; headings get `-0.02em` tracking.

**Surfaces & primitives** (`src/components/ui/`):
- `Card` → `.card-surface` (translucent `bg-card/75` + `backdrop-blur-xl`, hairline `white/7%` border, inset highlight). `interactive` adds `.card-hover` (glow border + 2px lift); `glow` adds `.ai-glow` (animated gradient rim — reserve for AI/featured surfaces).
- `Button` variants: `primary` (brand gradient + glow), `secondary`, `subtle`, `ghost`, `outline`, `destructive`; sizes `sm | md | lg | icon`.
- Hairline borders are `border-white/[0.06]`–`white/15`; glassy chrome is `bg-background/70` or `bg-card/40` + `backdrop-blur-xl`.
- Page tops use `PageHeader` (`src/components/app/page-header.tsx`): `text-2xl sm:text-3xl font-semibold tracking-tight` title, muted description, actions right-aligned on `sm+`.
- Icons/badges sitting on `bg-gradient-brand` must be `text-white` (`text-primary-foreground` is too dark to see).

**Motion** (`tailwind.config.ts` keyframes): `fade-in`, `scale-in`, `slide-up`, `slide-in-right` use `cubic-bezier(0.22, 1, 0.36, 1)` at ~0.2–0.3s. Ambient loops (`drift`, `float-y`, `glow-breathe`, `gradient-pan`) are slow (3.5–14s). Keep new motion in this vocabulary and respect `prefers-reduced-motion`.

**Layout**: sidebar `w-64` glass `<aside>` on `lg+`; below `lg` a sticky blurred top bar + slide-over drawer. Mobile uses safe-area helpers (`.pb-safe`, `.bottom-safe`).

**3D layers**: Dashboard has its own 3D Core; other in-app routes get the ambient backdrop mounted once in `src/app/layout.tsx` (per-route mood in `src/lib/scene/route-mood.ts`). Opaque page backgrounds hide it, so keep page roots transparent.

## UI / design workflow (Mobbin)

The Mobbin MCP (`mcp__mobbin__search_screens`, `search_flows`, `search_sections`) is the design-research step for UI work.

1. For any "improve / redesign the UI" request, research Mobbin first, **using `platform: "web"` only** (website references, never iOS, including for mobile-width patterns). Cover layouts, nav, typography, spacing, cards, dashboards, onboarding, interactions and mobile, rather than relying on generic UI knowledge.
2. Before a **major** visual change, present: the Mobbin references (linked via `mobbin_url`), the patterns worth taking, the recommended changes, the affected components, and a short implementation plan. **Wait for approval.**
3. Use references as inspiration only: translate patterns into this design system and never copy another product's interface.
4. Preserve functionality, routing, auth, Firestore integrations, APIs and business logic unless explicitly asked to change them.
5. Apply changes app-wide through tokens and shared primitives (`ui/`, `PageHeader`, `globals.css` component classes) so pages stay consistent.
6. No new dependencies just to reproduce a visual effect; Tailwind + existing keyframes + three are enough.
7. After implementing, check the affected pages in a browser at desktop and mobile widths.
8. Record approved design decisions below.

## Design decisions log

_(Add approved decisions here: date, what changed, why, Mobbin refs.)_

### 2026-10-01: stat strip, list-first Tasks, phone dock, richer School cards, quieter empty states
Refs (web only): HoneyBook home (stat strip), Todoist Today + Linear grouped list (Tasks), Trello / Visitors / Fabric floating docks (phone nav), Uxcel + Coursera (course cards).
- **Stats → `StatStrip` / `StatItem`** (`components/ui/stat-strip.tsx`): one `card-surface` with hairline dividers, not a card per number. Used on Tasks, Grades, Analytics. `compact` = one tight row on phones (sub-text hidden). Use this for any new page-level stats. (SAT keeps its own `Stat`; it's a separate app.)
- **Tasks is list-first**: Planned/Unplanned is a small pill segmented control on the same row as the tabs; tabs are text pills that scroll sideways on phones (`scrollbar-none`). "All open" groups into Overdue / Today / Next 7 days / Later / No date. Lists end with a dashed inline "Add task" row.
- **Phone dock** (`components/app/mobile-dock.tsx`, mounted by `Sidebar` when not controlled, `lg:hidden`): floating glass pill with Core, Tasks, +, Calendar, School. Active = `bg-primary/15` + glow inset ring. "+" reuses `QUICK_ADD_ACTIONS` / `QuickAddSheets` from `dashboard/quick-add.tsx`. While mounted it sets `<html data-dock>`, which lifts `.bottom-safe` UI (toasts, undo bar) by `--dock-offset`; the app shell adds `pb-28` below `lg`. Not shown on Dashboard / Assistant / Brain Game / SAT.
- **School folders show what's next**: soonest not-past-due open assignment + its relative due date, overdue count otherwise, and a thin grade bar in the course color.
- **Empty states dim the ambient backdrop**: `EmptyState` mounts `AmbientDimmer`, which multiplies ambient opacity by `EMPTY_STATE_DIM` (0.4) via `lib/scene/ambient-dim.ts`.

## Gotchas

- Never run `npm run build` while `next dev` is running; it corrupts `.next` (app hangs on the logo spinner). Fix: `rm -rf .next`.
