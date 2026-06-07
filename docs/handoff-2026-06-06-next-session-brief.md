# Next-session brief — 2026-06-06

> For a fresh Claude session picking the next direction. The monochrome UI/UX rollout is **complete and merged**. A **separate session is concurrently working on Plan M & N** (assume a Google-Form/Spreadsheet-style data-integration feature — see caveat). This brief lists **non-overlapping** candidate directions so the next session moves forward without colliding.

## One-line state

`main` tip ≈ `4c80dca`. Monochrome design-system rollout shipped across the whole app via PRs **#60–#67**. Pilot opens **2026-06-19** (~13 days out). No UI rollout work remains.

## What just shipped (PRs #60–#67) — do NOT redo

| PR | Scope |
|---|---|
| #60 | Foundation: tokens (near-black `--primary`, `--success`), primitives (`Field`/`Input`/`Select`/`Textarea`/`Toggle`/`Slider`/`SegmentedControl`/`EmptyState`/`Button`), thin-line illustration library, `Guide`/`InstallGuide` |
| #61 | `Field` auto-wires `aria-invalid` / `aria-describedby` |
| #62 | Devices adoption (Guide + form kit + EmptyState) |
| #63 | Guests adoption (SegmentedControl filters + EmptyState + success-token status) |
| #64 | Public register adoption (form kit + confirmation illustration + EmptyState edge states) |
| #65 | 5a — event-config forms (PIN, walk-in, create-wizard, form-builder, presentation editor, stats); added `--warning` token |
| #66 | 5b — org/members + links/events tables (Field kit, EmptyState, token-aligned dense inline controls) |
| #67 | 5c — auth (login), public walk-in info form, info not-found, audit chips; added `--warning-foreground` + `--destructive-foreground` tokens |

### Design-system reference (for whoever builds new UI next)
- **Tokens** (`frontend/app/globals.css`, light + `.dark`): `--primary` (near-black), `--success`/`--success-foreground`, `--warning`/`--warning-foreground`, `--destructive`/`--destructive-foreground`; greyscale otherwise. Color carries meaning only.
- **Primitives**: `frontend/components/ui/*`. **Illustrations**: `frontend/lib/illustrations/*` (thin-line, `currentColor`). **Guides**: `frontend/components/common/{guide,install-guide}.tsx`. **Style note**: `frontend/docs/ui-style-note.md`.
- **Conventions**: full-size controls use the primitives; **dense inline controls** (table cells, 2xl inline-edit) stay native + token-aligned (`bg-transparent` + `focus-visible:ring-3 focus-visible:ring-ring/50`), NOT the h-9 primitives.
- **Intentional exceptions (keep big/bold/colored)**: the **scanner** (`/scanner/*`) and the **walk-in claim** confirmation page — glanceable ✓/✕ screens.

## Concurrent work — avoid overlap

A separate session brainstormed/planned **Plan M & N** (not yet on `main` or any pushed branch as of this brief — likely uncommitted in that session's worktree). The originally-designated **Plan M = Google Form / Spreadsheet integration** (pilot-relevant data import/sync). **Assume M/N are that feature-integration lane** and do not touch CSV import, registration-field/data-source plumbing, or related backend until confirmed.

## Candidate next directions (non-overlapping)

### 🛡️ Pilot-readiness hardening — recommended (time-boxed by 2026-06-19)
- **Pilot dry-run + prod shakedown**: end-to-end run of the real flow on staging/prod; verify self-hosted Redis (#53, off Upstash) under load; prod-smoke the auth-gated UI that's only test-covered.
- **Security backlog**: narrow `ALLOWED_HOSTS` from `"*"` (Plan J debt); refresh-token revocation on logout; audit log of role changes / membership removals.
- **Email deliverability**: switch sender `onboarding@resend.dev` → verified `noreply@mail.byondr.co` (magic links + QR emails). Needs the prod email domain verified first.

### 🎨 UI/UX deepening (lower urgency; builds on the rollout)
- **a11y + dark-mode QA pass**: keyboard nav/focus order, dark-mode contrast, aria across the new primitives.
- **Loading/skeleton states**: add a `Skeleton` primitive + consistent treatment (lists still show plain "Loading…" text).
- **Responsive/mobile QA**: door staff + attendees are on phones/tablets — verify migrated layouts.
- Minor flagged item: `Guide` grid hardwires `lg:grid-cols-4` (a 3-step flow renders 2+1).

## Process / gotchas (for the next session)
- Workflow: brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/plans/`) → subagent-driven TDD execution → spec+quality reviews → independent pre-merge review → PR.
- Frontend: `source ~/.nvm/nvm.sh && nvm use 20` before `pnpm`; tests `pnpm test`; gate is `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`.
- PRs created/merged as **`vineidev`** (`gh auth switch --hostname github.com --user vineidev`). Commits: single-line conventional, **no `Co-Authored-By` trailer**. `gh pr merge --delete-branch`'s local step errors in this worktree setup ("main already checked out") — the remote merge still succeeds; delete the remote branch explicitly with `git push origin --delete <branch>`.
- 3 pre-existing `<img>` lint **warnings** (registration-form, walkins/info-form, event-presentation-editor banners) are accepted (kept as `<img>` — presigned Tigris URLs make `next/image` conversion non-trivial).
