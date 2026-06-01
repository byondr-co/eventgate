# Handoff — 2026-06-01 (Plan L hotfixes shipped)

> Closeout for the Plan L pilot-test-round-1 hotfixes. All 7 slices (S1–S7) implemented, reviewed (spec + code-quality), CI-green, and rebase-merged to `byondr-co/eventgate` `main`.

## What just shipped

10 findings from the prod pilot test, fixed across 7 file-disjoint PR slices on top of Plan L. Plan + per-slice spec: `docs/plans/2026-06-01-plan-l-hotfixes.md`. Lessons + commit list: `docs/plans/improvement-and-findings-logs.md` (Plan L Hotfixes wrap-up section).

| Slice | PR | What |
|---|---|---|
| S1 | #36 | `frontend/lib/toast.ts` (`notify.{success,error,warning,info}`) + hardened `extractApiError` (never raw HTML/JSON) + `extractFieldErrors` |
| S2 | #37 | Dedicated multipart banner endpoint `POST /orgs/<slug>/events/<slug>/banner/` (fixes `415`) + `FileDropZone` + 4MB cap + toasts |
| S3 | #38 | `/r/:path*` rewrite → backend in `next.config.ts` (fixes short links bouncing to `/login`) |
| S4 | #39 | Data-driven registration form from `event.fields` (deleted presets no longer render) + inline errors + `noValidate` |
| S5 | #40 | Self-removal guard in `OrgMembershipDetailView.destroy` + hide Remove on own row |
| S6 | #41 | CSV import modal widened + scrollable preview (caller-opt-in, `dialog.tsx` untouched) |
| S7 | #42 | Toast action feedback in guests-table + links-table; `notify.error` shows clean string messages verbatim |

`main` tip after merges: `cfd8ef1`.

## Locked decisions honored
1. **D1** — action notifications → toast; form/validation errors → inline (field-bottom for field-specific, form-top for generic); never raw HTML/JSON.
2. **D2** — banner upload via dedicated backend multipart endpoint + drag-drop dropzone + ~4MB client-side cap (dodges Vercel's ~4.5MB proxy body limit).
3. **D3** — registration form fully data-driven (renders entirely from `event.fields`, not conditional patching).

## Prod verification status (2026-06-01)

✅ **Backend (Fly prod) — LIVE & verified.** S2 + S5 are backend changes; the path-filtered prod deploy (`backend/**`) fired and **both succeeded**. Checks done:
- `GET https://api.eventgate.byondr.co/api/health/` → **200**.
- Banner endpoint wired: anon multipart `POST .../events/<slug>/banner/` → **401** (not `415`, not `404`) — route exists and the multipart parser is accepted. The original `415` path is gone at the API layer.

⏳ **Frontend (Vercel prod) — PENDING redeploy.** S1/S3/S4/S6/S7 are frontend. At closeout the live frontend was still serving a **stale build from before S3** (`/r/__probe__/` → `307 → /login`, `server: Vercel`). The code is correct on `main` (the `/r/*` rewrite mirrors the proven `/api/*` proxy exactly; there is no `middleware.ts`, no `vercel.json`, and no route capturing `/r`), so once Vercel finishes redeploying `main` the bounce will stop. **Note:** the eventgate Vercel project is under a **byondr Vercel account NOT accessible via the connected Vercel MCP** (the `vineiro-3892` team lists no projects), so the deploy state could not be inspected from this session.

## What the user still needs to confirm on prod

Once Vercel has redeployed `main` (check the byondr Vercel dashboard):
1. **Short link redirect (S3):** open `https://eventgate.byondr.co/r/<a-real-short-code>` → should redirect to the public register page, NOT `/login`. (A quick smoke: `curl -I https://eventgate.byondr.co/r/__anything__/` should no longer redirect to `/login`.)
2. **Banner upload (S2) — needs a logged-in session:** in an event's presentation editor, drag-drop an image → expect success toast + preview, no `415`/`502`. Try a >4MB image → expect the "under 4 MB" rejection client-side.
3. **Short-link create (S1/S7):** create a short link in the Links tab → expect a clean success toast and the row, NOT a raw-HTML error. If the intermittent `502 ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR` recurs after the 4MB cap, escalate to Fly/Vercel networking (prod has `min_machines_running = 1`, not scale-to-zero) rather than assuming body size.
4. **Owner enforcement (S5):** confirm you can't remove yourself and the Remove button is absent on your own member row.
5. **CSV modal (S6) / data-driven form (S4):** import a wide CSV (modal should scroll, not break); confirm a field deleted in the builder no longer appears on the public register page.

## Gotchas reconfirmed this round (for future agents)
- DRF default parsers are **JSON-only** (`backend/config/settings/base.py:104`) → multipart endpoints must set `parser_classes` explicitly.
- `next.config.ts` rewrites **only `/api/*`** by default → any other backend path needs its own rewrite.
- Repo uses **Base UI (`@base-ui-components/react`), NOT Radix** — Dialog uses a `render` prop.
- **Branch protection does NOT gate on `test`** → always `gh pr checks <n>` before merge. Backend+frontend PRs get two `test` jobs.
- **Fresh worktrees** can fail to resolve `sonner` / native rolldown bindings → some `pnpm test` files error at import locally; CI (clean install) is the authoritative gate.
- **Vercel prod frontend is not in the connected Vercel MCP account** — can't inspect/await its deploys from a Claude session; backend Fly deploys are immediate via GitHub Actions, frontend lags.

## Branches / cleanup
PR branches `feature/plan-l-hotfix-s1..s7` were auto-deleted on merge. The local `worktree-agent-*` worktrees for this round can be pruned (`git worktree prune` + delete the temp branches) — they're already merged.

## Still deferred (unchanged from Plan K closeout)
- Narrow `ALLOWED_HOSTS` from `"*"`; audit log of role changes; refresh-token revocation on logout; short-URL custom domains; org slug rename.
- **Plan M** (Google Form / Spreadsheet integration) — next up, target merged by 2026-06-12 (T-7) for the dry-run smoke. Pilot window: 2026-06-19 → 2026-07-17.
