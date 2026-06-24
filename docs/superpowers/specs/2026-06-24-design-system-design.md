# RMail Design System — Design Spec (Phase 0)

**Date:** 2026-06-24
**Status:** Draft for review
**Scope:** Shared design-system foundation for the RMail product layer (`product/`)

---

## 1. Context & goal

RMail (Resillix) is a SaaS product layer on top of the Stalwart mail server, made of three
apps in an npm workspace:

- `product/portal` — Next.js 15 control plane (signup, billing, onboarding, admin)
- `product/webmail` — Vite + React 19 JMAP mail client
- `product/api` — Fastify + Prisma + Stripe backend

A complete design system was produced (~22 mockup screens covering portal + webmail). The
mockups are visually polished but use ad-hoc, per-screen CSS. Before building any screen, we
need **one shared, reusable foundation** so every button, field, badge, and color is defined
once and looks identical across both apps.

**This spec covers Phase 0 only: the design system.** It does not build any product screen.

### Decisions locked during brainstorming
- Build order: **design system first**, then portal, then webmail.
- Webmail visual direction (for later): **OpenAI / calm** (quiet, minimal, ink `#0d0d0d` accent).
- Brand red unified to **`#db2d54`** (portal's red, the most-used across screens).
- Type sizes **standardized** to a clean scale (replacing mockups' 14.5/12.5/13.5px values).
- Committed next-priority after this phase: **college / large-org bulk onboarding**
  (15k–30k student mailboxes). The design system must therefore also include the components
  that bulk-admin flows need (large tables, file upload, wizard, search/filter).
- Mail-host foundations (deliverability, abuse protection, MFA, backups) are out of scope for
  Phase 0 but noted in the roadmap so the system anticipates their UI later.

---

## 2. Roadmap context (for orientation; only Phase 0 is specified here)

| Phase | Focus |
|---|---|
| **0 (this spec)** | Shared design system: tokens, fonts, ~20 components, live preview |
| 1 | Portal control plane **+ college bulk onboarding** (roster/CSV/SCIM import, SAML SSO, lifecycle, education pricing, FERPA posture) |
| 2 | Webmail core (OpenAI/calm) + Calendar/Contacts (surfacing CalDAV/CardDAV the server already has) |
| 3 | AI layer (Claude-powered summaries/draft/brand-voice/⌘K search) + identity composer + BIMI |
| 4 | Migration/import (Gmail/Outlook/IMAP), mobile/PWA |
| woven throughout | Deliverability & outbound-abuse control, MFA/passkeys, RBAC, audit export, retention/legal-hold, quotas, backups/DR |

---

## 3. Architecture

A new workspace package **`product/ui`** (published name `@rmail/ui`), consumed by both
`portal` and `webmail`.

- **Styling:** plain **CSS custom properties + co-located component CSS**. No Tailwind or CSS-in-JS.
  Rationale: the mockups are hand-written CSS (faithful port), and plain CSS avoids build-tool
  coupling between Next.js (portal) and Vite (webmail).
- **Components:** React 19 function components, TypeScript, framework-agnostic (no Next- or
  Vite-specific imports), so both apps can use them unchanged.
- **Theming:** tokens are CSS variables on `:root`. A small set of webmail-specific overrides
  (the calm/neutral palette) live under a `.theme-webmail` scope for Phase 2.

### Wiring
- Add `"ui"` to `product/package.json` `workspaces`.
- `portal` and `webmail` add `"@rmail/ui": "*"` as a dependency.
- `portal/next.config.js` gains `transpilePackages: ['@rmail/ui']` so Next compiles the package
  and its CSS. Vite needs no extra config.

### Package structure
```
product/ui/
  package.json            # name "@rmail/ui", peerDeps react/react-dom
  tsconfig.json
  src/
    styles/
      reset.css           # minimal normalize
      tokens.css          # all design tokens (CSS variables)
      fonts.css           # @font-face / font bundling
      index.css           # imports the three above (apps import this once)
    components/
      Button/{Button.tsx, Button.css, Button.test.tsx}
      Input/  ...
      ...one folder per component...
    index.ts              # barrel export of all components
  preview/                # the live preview (see §7)
```

---

## 4. Design tokens

All values are extracted from the mockups, with the type scale standardized.

### Color
```
/* Brand */
--c-brand:        #db2d54;   --c-brand-hover:  #c2264a;
--c-brand-fg:     #ffffff;   --c-brand-soft:   #fdf3f5;
--c-brand-ring:   rgba(219,45,84,.12);

/* Text / ink */
--c-text:         #16151c;   --c-text-2: #7a7589;   --c-text-3: #b3aab0;
--c-ink-webmail:  #0d0d0d;   /* calm webmail accent (Phase 2) */

/* Surfaces */
--c-bg:           #faf6f4;   /* warm page background (portal) */
--c-surface:      #ffffff;
--c-surface-2:    #f7f7f8;   /* cool surface (webmail sidebar) */
--c-surface-3:    #f1eeec;

/* Borders */
--c-border:       #e7dedb;   --c-border-2: #efedeb;   --c-border-cool: #ececed;

/* Semantic */
--c-info:    #100e42;  --c-info-fg:    #100e42;  --c-info-bg:    #eceaf5;
--c-success: #2f9e5e;  --c-success-fg: #23704a;  --c-success-bg: #edf6f0;
--c-warning: #c2651c;  --c-warning-fg: #a85420;  --c-warning-bg: #fbe9d9;
--c-danger:  #cf2b2b;  --c-danger-fg:  #a3211f;  --c-danger-bg:  #fdecec;
```
(Exact danger hex to be finalized from the `States` mockup during implementation.)

### Typography (standardized scale)
- Families: `--font-sans: 'Hanken Grotesk', system-ui, sans-serif;`
  `--font-mono: 'JetBrains Mono', ui-monospace, monospace;`
- Base size **14px**; reading text 16px.

| Token | px | line-height | typical use |
|---|---|---|---|
| `--fs-xs` | 12 | 1.4 | captions, table labels |
| `--fs-sm` | 14 | 1.5 | base UI / body |
| `--fs-md` | 16 | 1.6 | reading text, inputs |
| `--fs-lg` | 18 | 1.4 | section titles |
| `--fs-xl` | 22 | 1.3 | page titles |
| `--fs-2xl` | 28 | 1.2 | screen headings |
| `--fs-3xl` | 36 | 1.1 | pricing / display |

Weights: 400 regular, 500 medium, 600 semibold, 700 bold.

### Spacing, radius, shadow, motion
```
--space: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 (px)
--r-sm:8  --r-md:11  --r-lg:16  --r-xl:22  --r-2xl:26  --r-pill:999
--shadow-sm:    0 1px 2px rgba(70,48,28,.06)
--shadow-card:  0 1px 2px rgba(70,48,28,.05), 0 18px 40px -22px rgba(70,48,28,.30)
--shadow-modal: 0 30px 70px rgba(20,18,30,.28)
--ease: cubic-bezier(.2,.7,.3,1);  durations 140 / 180 / 240 ms
```

---

## 5. Fonts

- Hanken Grotesk (400/500/600/700) and JetBrains Mono (400/500) bundled as self-hosted
  `woff2` via `@fontsource/*`, referenced in `fonts.css`. Self-hosting avoids a runtime
  dependency on Google Fonts and keeps load fast and identical in both apps.
- `font-display: swap`.

---

## 6. Component inventory

Each component ships with: TypeScript props, co-located CSS, all states, and a render test.

### Core primitives
1. **Button** — variants `primary` / `secondary` / `ghost` / `danger`; sizes `sm` / `md`;
   states hover / active / disabled / loading; optional leading icon and keyboard-hint slot.
2. **Input** / **Textarea** — label, hint, error, focus ring; `mono` variant for code values.
3. **Field** — wrapper providing label + description + error layout.
4. **Select** — styled native select.
5. **Checkbox** and **Radio** — incl. the radio-card style used by plan selection.
6. **Toggle** (switch) — settings / SSO enable.
7. **Card** — `default`, `selected` (brand border + soft bg), `interactive` (hover lift).
8. **Badge / StatusPill** — `neutral` / `success` / `warning` / `danger` / `info`, optional dot.
9. **Banner / Alert** — `info` / `success` / `warning` / `danger`; icon + message + actions
   (past-due, suspended, seat-limit).
10. **Avatar** — initials; sizes; deterministic color from name.
11. **Tabs** — content tabs and sidebar nav items.
12. **Modal / Dialog** — overlay + card (invite result, seat-limit).
13. **ProgressBar** — determinate (seats / storage).
14. **CopyField / CodeBlock** — mono value + one-click copy (DNS / DKIM records).
15. **Table** — header, rows, status cells, row actions.

### Additions for college / bulk-admin flows
16. **DataTable extras** — bulk-select checkbox column, pagination, sort — so the user table
    scales to thousands of student rows.
17. **Toolbar / SearchBar** — filter/search above large tables.
18. **FileDropzone** — CSV/roster upload with file validation + progress.
19. **Stepper / Wizard** — multi-step onboarding progress
    (Provision → DNS → DKIM → Invite), with done / active / pending states.
20. **EmptyState** and **Skeleton** — empty + loading states.

(Calendar/contacts-specific components are deferred to Phase 2.)

---

## 7. Live preview

A single preview route in the portal app at **`/design`** that renders every component in
every variant/state on one scrollable page, grouped by component. This is the human checkpoint
— the user opens `localhost:3000/design` to confirm the look before any product screen is built.

(Implemented as a Next.js route so it needs no new build target; it renders `@rmail/ui`
exactly as the real apps will.)

---

## 8. Testing

- **Unit/render tests** (Vitest + React Testing Library) per component: renders without error,
  applies the right variant/size attributes, respects `disabled`, fires `onClick`, etc.
- **Preview page** serves as the visual-regression checkpoint (manual for Phase 0).
- Test command added to `product/ui` package (`npm run test --workspace=ui`).

---

## 9. Success criteria

- `product/ui` (`@rmail/ui`) exists as a workspace package, built and importable.
- `localhost:3000/design` renders all ~20 components in all states with no console errors,
  matching the mockup tokens and the standardized type scale.
- A `Button` (and one other component) imported and rendered in **both** `portal` and `webmail`
  proves cross-app consumption works (Next transpile + Vite).
- All component render tests pass.

---

## 10. Out of scope / future

- Dark mode (deferred; tokens are structured so it can be added later).
- The full `.theme-webmail` calm palette tuning (Phase 2, when webmail is built).
- Calendar/contacts components (Phase 2).
- Any actual product screen, API wiring, or business logic.

---

## 11. Open questions

- Confirm self-hosted fonts via `@fontsource` (vs. licensed font files you may already own).
- Confirm the preview lives at portal `/design` (vs. a standalone preview app).
