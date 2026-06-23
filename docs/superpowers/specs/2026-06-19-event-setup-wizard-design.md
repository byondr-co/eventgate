# Event Setup Wizard — design spec

> **Date:** 2026-06-19
> **Status:** Approved design (brainstorm complete). Next step: `writing-plans`.
> **Program context:** Slice 1 of the post-pilot "Eventgate v2 uplift" program.
> Inputs: pilot retro (`docs/plans/improvement-and-findings-logs.md` → Pilot retro
> section) and the Phase 2 candidate slate
> (`docs/plans/2026-06-11-phase2-candidate-slate.md`).

## Why

The Click Cam pilot succeeded (174 guests, no notable breakage, Google Form
bridge stayed enabled). The loudest organizer feedback: **the product is too
technical** — especially Google Form bridge setup and the admin flows. Organizers
want a modern, motion-driven, lightly-illustrated UI that a non-technical person
can run end-to-end with few clicks and little or no technical admin.

This spec covers **slice 1**: a unified, guided **Event Setup Wizard** that takes
an organizer from "new event" to "live and accepting guests" in one cohesive flow,
with a co-equal native / Google-Form registration branch. The design system and
motion layer are grown *inside* this slice (demand-driven), not as a separate
abstract foundation.

## Goals & success criteria

- A non-technical organizer creates an event, picks a registration method, and
  goes live **without external help**.
- **Native path:** zero Google / technical steps.
- **Bridge path:** organizer sees a green **"test submission received"** before
  going live — a trust gate that proves the integration works.
- Few clicks to live; design for it now, instrument click-to-live later.

## Non-goals (parked — captured so they are not lost)

- **Google OAuth auto-install** of the Apps Script (option C). Would eliminate the
  manual paste entirely but needs OAuth infra + Google Forms/Apps Script APIs; no
  OAuth in the codebase today. → side-memo `docs/plans/future-google-oauth-bridge-autoinstall.md`.
- **Remotion event share-video** (generated per-event promo/QR-reveal MP4). Real
  product value but a separate feature surface → its own future program slice.
- **Bulk CRUD / search / filter / sort / pagination / export gaps** → program
  slices 2/3.
- **Reskinning every settings page.** The wizard is create / first-setup only;
  existing dashboard + settings pages remain the edit surface and get a visual pass
  in a later slice.

## Flow architecture

The route `/orgs/[slug]/events/new` becomes the wizard (replaces the current
single-page `EventCreateWizard`). The wizard owns step state, synced to the URL
(`?step=`) so refresh and browser back behave.

### Spine

```
1. Basics        → name, slug (auto), venue, walk-in capacity   (current 4 fields, restyled)
2. Registration  → "How do guests register?"  [ Native form | Google Form ]   ← the branch
3a. Native       → form-field builder (reuse existing registration-form-builder)
3b. Google Form  → bridge sub-wizard (see below)
4. Review        → summary: event + registration method + go-live checklist
5. Go live       → confirm → status draft→open; success state + share link / QR
```

### Branch behavior

- Native is the **pre-selected default** (simplest path).
- Step 2 choice drives step 3. Switching method mid-wizard is allowed and discards
  the other branch's unsaved config (with a confirm).

### Persistence model

- The event row is **created at the end of step 1** so the slug/capacity are
  validated server-side early and the bridge/fields attach to a real event id.
- Steps 3–5 PATCH that event.
- Abandoning leaves the event in `draft` (its natural state), editable later via the
  existing pages.

### Navigation & exits

- Animated progress indicator across the top; back / next; **"save & exit"** lands
  on the event dashboard in `draft`.
- After **Go live**, the wizard hands off to the existing event dashboard.
- Re-entering an event does **not** re-run the wizard — the dashboard + settings
  pages remain the edit surface (wizard = first-setup only).

### Reuse

- Native branch wraps the existing `registration-form-builder`.
- Bridge branch wraps redesigned `GoogleFormBridgeCard` logic.
- The wizard is a new shell; underlying API calls are unchanged where possible.

## Bridge sub-wizard (the de-tech'd path)

Replaces the current dump-everything `GoogleFormBridgeCard`
(`integrations/google-form-bridge-card.tsx`). Steps inside wizard step 3b:

```
i.   Intro      → "Connect your Google Form" + short illustrated what-happens explainer
ii.  Create+map → create bridge (secret generated silently) → auto-detect fields → confirm mapping
iii. Install    → one-click-copy snippet + illustrated Google steps (Sheet → Extensions →
                  Apps Script → paste → Run). No raw textarea; copy button + collapsible code.
iv.  Test       → "Send a test submission from your Form" → live poll → green check + parsed preview
v.   Finish     → enable bridge → return to Review
```

### Auto-detect fields (kills manual label typing)

- The webhook payload the Apps Script already sends carries the Google Form labels.
  The processor records observed label keys on the bridge (`seen_labels`).
- The wizard reads them and pre-fills the mapping UI; the organizer just confirms
  the target Eventgate field per detected label (dropdowns pre-guessed by name
  match). No Google API involved.

### Test-submission verification (trust gate)

- Step iv polls for the latest test submission until one arrives or it times out.
- **A test submission is a dry-run (decision A1):** parsed and validated, an audit
  row is written (`kind="test"`), but **no guest row and no QR email** — the real
  guest list stays clean.
- Green state shows the parsed guest preview; red / timeout shows troubleshooting
  (snippet not saved? trigger missing? secret mismatch?).

### Secret handling

- Generated silently and embedded directly into the copyable snippet — no "copy
  this once" raw block. Rotation stays available later in settings.

## Design-system & motion layer

Demand-driven: build only what the wizard needs, namespaced so later slices reuse
it. No abstract foundation slice.

### Motion (`motion` / framer-motion — new dependency)

- New `components/motion/` primitives (thin, reusable wrappers):
  - `<StepTransition>` — enter/exit between wizard steps
  - `<Stagger>` — list / field reveal
  - `<Tappable>` — button / card press feedback
  - `<SuccessBurst>` — go-live + test-pass celebration
- All primitives respect `prefers-reduced-motion` (degrade to instant / opacity-only).
- Animated progress indicator across the wizard top.

### Graphic / illustration layer

- Small inline-SVG set in `components/illustrations/`: wizard step heroes,
  empty / success / error states, the Google-install diagram. Minimal, one/two-tone,
  using existing OKLCH tokens so dark-mode and theme stay consistent. No external
  image dependencies.

### Tokens / components

- Extend the existing OKLCH token set only as needed (e.g. an accent for the active
  step, a success glow). No new color system — build on `app/globals.css`.
- Compose existing shadcn primitives (Card, Button, Field, Select) into
  wizard-specific composites: `<WizardShell>`, `<StepNav>`, `<ChoiceCard>`. Existing
  components are left untouched → no regression elsewhere.

### Aesthetic direction

The `frontend-design` skill is applied at build time to set type scale, spacing
rhythm, color accents, and the modern / light / motion feel the organizer asked for.

### Boundary discipline

All new surface is namespaced (`motion/`, `illustrations/`, `wizard/`) so slice 1
ships without touching existing flows; later slices opt in to the primitives.

## Backend changes (additive, no breaking changes)

- **`GoogleFormBridge.seen_labels`** (array/JSON) — populated when a webhook
  submission arrives; powers auto-detect. Migration required.
- **`GET .../bridge/<id>/detected-fields/`** — returns seen labels plus name-match
  guessed target fields for wizard step ii.
- **Dry-run test submission (A1):** the webhook accepts a test marker (e.g.
  `X-Eventgate-Test: true` or `?test=1`); the processor parses + validates, records a
  `GoogleFormSubmission(kind="test")` audit row, and **skips** `register_guest()` and
  the QR queue. Returns the parsed preview.
- **`GET .../bridge/<id>/submissions/?kind=test&latest=1`** — the step-iv poll target.
- Event create / PATCH endpoints: confirm partial wizard saves are supported (likely
  already; verify in the plan).
- The Apps Script snippet generator (`googleFormBridgeAppsScript`) is extended to
  embed the secret, send `seen_labels` on submit, and tag test submissions.

## Testing

- **Backend:** unit tests for the detected-fields endpoint, the dry-run path
  (asserts no guest, no QR, audit row written), and the test-submission poll.
  Existing bridge tests stay green.
- **Frontend:** wizard step-machine tests (branch switch, back/next, save&exit →
  draft), component tests for the new composites, a reduced-motion assertion.
- **e2e (Playwright — lane exists):** native happy path create → live; bridge happy
  path through dry-run test pass → live (webhook mocked).
- **Manual:** reuse the real-Sheet rehearsal runbook
  (`docs/runbooks/google-form-bridge-apps-script.md`).

## Follow-up memos to write alongside the plan

- `docs/plans/future-google-oauth-bridge-autoinstall.md` — option C rationale + why
  deferred.
- Add a Remotion event share-video slice to the uplift program table.
- Update `docs/plans/2026-06-11-phase2-candidate-slate.md` to reflect the re-rank
  (UX uplift program now top; revenue track — entitlement / per-event metering /
  ABA PayWay — runs in parallel).

## Open items deferred to the plan (not blockers)

- Exact test marker mechanism (`header` vs query param) — pick during implementation.
- Whether name-match field guessing lives client- or server-side.
- Final visual tokens / motion timings — set under `frontend-design` at build.
