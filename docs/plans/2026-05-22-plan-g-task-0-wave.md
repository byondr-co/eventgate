# Plan G — Task 0 wave (Plan F carryovers, pre-headline cleanup)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Per-task worktree pattern from Plans E and F: each task → `Agent` tool with `isolation: "worktree"` + relative paths only in prompts; spec + quality review subagents after each implementer; merge agent's branch into `main` via rebase + ff-only. Independent tasks dispatched in parallel waves where they touch disjoint files.

**Goal:** Land the five Plan F carryovers locked at hand-off — frontend data-fetching standardization, pre-commit prettier check, audit `details_json` rendering, verification-checklist hygiene, and an explicit cross-device re-verification methodology — so Plan G enters its Telegram + CSV-import headline with a clean parking lot.

**Architecture:**

- **One data-fetching library.** TanStack Query is already used in 10 frontend lib/page files (`audit.ts`, `events.ts`, `auth.ts`, `orgs.ts`, `guests.ts`, `devices.ts`, `walkins.ts`, `event-stats.ts`, `providers.tsx`, `debug/health/page.tsx`). SWR only lives in `lib/helpdesk.ts` (the holdover from Plan F Task 8). Task 0a migrates `helpdesk.ts` onto TanStack and drops `swr` from `package.json` / `pnpm-lock.yaml`.
- **Pre-commit catches what CI catches.** `pnpm prettier --check` already runs in CI via Plan F's lint pipeline; running it pre-commit closes the loop that bit us at `ed50eb1`. New `local` hook in `.pre-commit-config.yaml`, mirroring the existing `frontend-lint` hook shape.
- **Audit table expandable rows.** No new endpoint, no schema change — `details_json` is already shipped by `GET /audit/`. The page-level fix is purely UI: a chevron toggle per row, second `<tr>` with `colSpan={6}` rendering `<pre>{JSON.stringify(details_json, null, 2)}</pre>`. Cheaper than a modal, denser than a column.
- **Verification checklist hygiene as docs-only patches.** Three textual fixes to the Plan F verification checklist for items surfaced during Plan F verification. No code, no migration.
- **Cross-device methodology as a separate companion doc.** Plan F's verification accepted `checkin.conflict` and the walk-in flow as implicitly passed; both were last explicitly verified at `825b7e6` (pre-Plan-F). Task 0e produces a step-by-step doc the user runs manually with two scanner instances + a tablet; findings get logged into a follow-up `-findings.md`.

**Tech Stack:** Next.js 16 + React 19 + TanStack Query 5 + Tailwind v4 + shadcn/ui (frontend); pre-commit + prettier 3.8 (tooling); Markdown only (docs).

---

## Scope summary (locked at hand-off)

1. Task 0a — Migrate `frontend/lib/helpdesk.ts` from SWR to TanStack Query; drop `swr` from deps
2. Task 0b — Add `prettier --check` to `.pre-commit-config.yaml`
3. Task 0c — Audit page: expandable rows surfacing `details_json`
4. Task 0d — Plan F verification-checklist hygiene patches (3 edits)
5. Task 0e — Write cross-device re-verification methodology doc (`checkin.conflict` + walk-in flow)

**Total: 5 tasks.** Frontend tasks built inline (no new Vitest tests required — these are UI tweaks and a library swap with existing typecheck + lint guarding the change). Tooling and docs tasks are direct edits. Each commit is a single-line conventional-commit subject — **no body, no `Co-Authored-By` trailer.**

---

## Suggested execution waves

The controller picks ordering at execution time; this is a hint, not a contract.

| Wave | Tasks | Reasoning |
|---|---|---|
| A (parallel) | 0a, 0b, 0c, 0d, 0e | Disjoint files: 0a (`frontend/lib/helpdesk.ts`, helpdesk page, `package.json`, `pnpm-lock.yaml`), 0b (`.pre-commit-config.yaml`), 0c (`audit/page.tsx`), 0d (Plan F verification checklist), 0e (new doc file). No file overlap; all five dispatch together. |

All five tasks are independent. After Wave A merges, kick off Plan G headline brainstorming (Telegram + CSV import per brief §12 W12).

---

## Pre-flight (zero tasks; do this once before kicking off Wave A)

Confirm the baseline matches the Plan F hand-off:

```bash
cd /Users/vinei/Projects/eventgate
git pull
git log --oneline | head -3
# Expect: 55f2afc docs(handoff): Plan F shipped + verified — update parking lot for Plan G

docker compose up -d
cd backend && uv run pytest -q
# Expect: 172 passed (or 171 passed + 1 known concurrency flake)

cd ../frontend && pnpm install --frozen-lockfile && pnpm test && pnpm typecheck && pnpm lint
# Expect: tests pass, no type errors, no lint warnings
```

If any of these fail, stop and diagnose before kicking off Plan G Task 0 wave.

---

## Task 0a — Migrate `helpdesk.ts` from SWR to TanStack Query

> The frontend has two data-fetching libraries. TanStack Query is the dominant convention (10 consumers). SWR survives only in `lib/helpdesk.ts` from Plan F Task 8. Migrate that file and the helpdesk page off SWR, then drop `swr` from `package.json` and `pnpm-lock.yaml`.

**Files:**
- Modify: `frontend/lib/helpdesk.ts`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/page.tsx`
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml` (regenerated by `pnpm install`)

**Pattern to follow:** `frontend/lib/audit.ts` — same ETag cache + `useQuery` shape we want here.

- [ ] **Step 1: Rewrite `useTickets` and `useManualReviewGuests` in `frontend/lib/helpdesk.ts`**

Keep the existing `AuditEventCompact`, `Ticket`, `ManualReviewGuest`, `InboxItem`, `ListResponse`, `ManualReviewListResponse` types and the existing `ticketsEtagCache` / `fetcher` definitions. Replace only the two `useSWR` hook bodies. Final shape of those two hooks:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";

import { createEtagCache } from "@/lib/etag-fetch";

// ... (unchanged types: AuditEventCompact, Ticket, ListResponse, ManualReviewGuest, ManualReviewListResponse, InboxItem)
// ... (unchanged: ticketsEtagCache, fetcher)

export function useTickets(orgSlug: string, eventSlug: string, status: string) {
  const qs = status === "all" ? "" : `?status=${status}`;
  return useQuery({
    queryKey: ["helpdesk-tickets", orgSlug, eventSlug, status],
    queryFn: () =>
      ticketsEtagCache.fetchJSON<ListResponse>(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/${qs}`,
      ),
    enabled: !!orgSlug && !!eventSlug,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

export function useManualReviewGuests(orgSlug: string, eventSlug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["helpdesk-manual-review", orgSlug, eventSlug],
    queryFn: async (): Promise<ManualReviewListResponse> => {
      const r = await fetch(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/?entry_status=manual_review`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`${r.status}`);
      const body = (await r.json()) as ManualReviewListResponse | ManualReviewGuest[];
      if (Array.isArray(body)) {
        return { results: body, count: body.length };
      }
      return body;
    },
    enabled: enabled && !!orgSlug && !!eventSlug,
    refetchInterval: 5000,
  });
}
```

Remove the top-level `import useSWR from "swr";` line. The `claimTicket`, `releaseTicket`, `resolveTicket`, `resolveManualReview` mutation functions and the `InboxItem` type are unchanged — keep them.

- [ ] **Step 2: Update `helpdesk/page.tsx` so `.mutate()` becomes `.refetch()`**

Find the `refresh` callback in `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/page.tsx`:

```tsx
const refresh = () => {
  void ticketsQuery.mutate();
  void manualQuery.mutate();
};
```

Replace with:

```tsx
const refresh = () => {
  void ticketsQuery.refetch();
  void manualQuery.refetch();
};
```

No other changes to that page — the `ticketsQuery.data?.results`, `manualQuery.data?.results`, `useMemo` dependency array all keep working because TanStack and SWR both expose `.data` on the hook return.

- [ ] **Step 3: Drop `swr` from `frontend/package.json`**

In `frontend/package.json`, remove the line:

```json
    "swr": "^2.4.1",
```

(The line currently sits between `"sonner": "^2.0.7"` and `"tailwind-merge": "^3.3.1"` — adjust trailing-comma punctuation on the surrounding lines if needed so the JSON remains valid.)

- [ ] **Step 4: Regenerate the lockfile**

```bash
cd frontend
pnpm install
```

Expect: `pnpm-lock.yaml` updated, `swr` no longer present. Run `grep -c '^  swr' pnpm-lock.yaml` — should be `0`.

- [ ] **Step 5: Verify typecheck, lint, and tests still pass**

```bash
cd frontend
pnpm typecheck
pnpm lint
pnpm test
```

Expect: all green. If typecheck complains about `.mutate` still being called anywhere, fix the call site (only `helpdesk/page.tsx` should reference it).

- [ ] **Step 6: Manual smoke — helpdesk page still polls and refreshes**

```bash
cd frontend
pnpm dev
```

Open `http://localhost:3000/orgs/<slug>/events/<eventSlug>/helpdesk` (use any seeded org/event). Confirm:

- The page renders the ticket list and filter chips identically to before.
- DevTools → Network → filter "tickets/" shows a fetch every ~5 seconds (the `refetchInterval: 5000`).
- Performing a claim/release/resolve in the right pane refreshes the list (the `refresh` callback wired to `.refetch()` works).

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/helpdesk.ts frontend/app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/helpdesk/page.tsx frontend/package.json frontend/pnpm-lock.yaml
git commit -m "refactor(frontend): migrate helpdesk hooks from SWR to TanStack Query; drop swr dep"
```

---

## Task 0b — Add `prettier --check` to pre-commit

> Plan F commit `ed50eb1` (`fix(helpdesk): ETag input includes Count …`) had to be re-pushed because `pnpm prettier --check` ran in CI but not locally. One-line addition to `.pre-commit-config.yaml` closes the gap.

**Files:**
- Modify: `.pre-commit-config.yaml`

- [ ] **Step 1: Add the prettier-check hook**

Current bottom-of-file `local` hooks section:

```yaml
  - repo: local
    hooks:
      - id: frontend-lint
        name: frontend eslint
        entry: bash -c 'source ~/.nvm/nvm.sh >/dev/null 2>&1 && nvm use 20 >/dev/null 2>&1 && cd frontend && pnpm lint'
        language: system
        files: ^frontend/.*\.(ts|tsx|js|jsx)$
        pass_filenames: false
```

Add a sibling hook directly after `frontend-lint`, inside the same `hooks:` list:

```yaml
      - id: frontend-prettier-check
        name: frontend prettier --check
        entry: bash -c 'source ~/.nvm/nvm.sh >/dev/null 2>&1 && nvm use 20 >/dev/null 2>&1 && cd frontend && pnpm prettier --check .'
        language: system
        files: ^frontend/.*\.(ts|tsx|js|jsx|json|md|css)$
        pass_filenames: false
```

(`.` is intentional — `frontend/.prettierignore` already scopes the check. `pass_filenames: false` matches the lint hook so we don't argv-bomb prettier.)

- [ ] **Step 2: Verify the hook passes on a clean tree**

```bash
pre-commit run frontend-prettier-check --all-files
```

Expect: `Passed`. If it fails, the working tree has pre-existing format violations — run `cd frontend && pnpm format` to fix, commit the formatting fixups separately, then retry.

- [ ] **Step 3: Verify the hook catches a deliberate violation**

```bash
cd frontend
# pick a file that already passes prettier
head -5 lib/helpdesk.ts > /tmp/helpdesk-backup.ts
sed -i '' 's/import useSWR/import   useSWR/' lib/helpdesk.ts || true   # mangle if SWR still there; or pick any file
cd ..
pre-commit run frontend-prettier-check --all-files
```

Expect: `Failed` with a prettier diff. Restore the file:

```bash
cd frontend && git checkout lib/helpdesk.ts && cd ..
```

(Skip this step if Task 0a has already shipped and `helpdesk.ts` no longer imports `useSWR` — substitute any other file the same way, e.g. `app/(app)/page.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "chore(pre-commit): add prettier --check for frontend"
```

---

## Task 0c — Audit page: expandable rows for `details_json`

> The audit table currently shows time/action/result/actor/token/status but drops `details_json`, which is the richest field — the one operators actually need when an action looks suspicious. Add per-row expand/collapse that surfaces the JSON.

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx`

- [ ] **Step 1: Add expand-row state and a chevron column to the table**

Current top of `AuditPage`:

```tsx
export default function AuditPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const [prefix, setPrefix] = useState("all");
  const { data, isLoading } = useAuditEvents(slug, eventSlug, prefix);
```

Replace with:

```tsx
export default function AuditPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const [prefix, setPrefix] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data, isLoading } = useAuditEvents(slug, eventSlug, prefix);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
```

- [ ] **Step 2: Add a leading chevron column to `<thead>` and update `colSpan` math**

Current `<thead>`:

```tsx
<thead>
  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
    <th className="py-2 pr-3">Time</th>
    <th className="py-2 pr-3">Action</th>
    <th className="py-2 pr-3">Result</th>
    <th className="py-2 pr-3">Actor</th>
    <th className="py-2 pr-3">Token</th>
    <th className="py-2">Status</th>
  </tr>
</thead>
```

Replace with:

```tsx
<thead>
  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
    <th className="w-6 py-2 pr-1" aria-label="Expand"></th>
    <th className="py-2 pr-3">Time</th>
    <th className="py-2 pr-3">Action</th>
    <th className="py-2 pr-3">Result</th>
    <th className="py-2 pr-3">Actor</th>
    <th className="py-2 pr-3">Token</th>
    <th className="py-2">Status</th>
  </tr>
</thead>
```

- [ ] **Step 3: Replace the row template with one that includes the chevron button and a conditional expansion row**

Current `<tbody>` body (inside `{(data?.results ?? []).map((row) => (`):

```tsx
<tr key={row.id} className="border-b text-xs">
  <td className="py-2 pr-3 font-mono">
    {new Date(row.occurred_at).toLocaleString()}
  </td>
  <td className="py-2 pr-3 font-mono">{row.action}</td>
  <td className="py-2 pr-3">
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${resultClasses(row.result)}`}
    >
      {row.result}
    </span>
  </td>
  <td className="py-2 pr-3 font-mono">
    {row.actor_type}:{row.actor_id.slice(0, 8)}
  </td>
  <td className="py-2 pr-3 font-mono">{row.entry_token.slice(0, 16)}</td>
  <td className="py-2 font-mono">
    {row.previous_status} → {row.new_status}
  </td>
</tr>
```

Replace the whole `(data?.results ?? []).map((row) => (...))` body with a fragment that conditionally renders a second row:

```tsx
{(data?.results ?? []).map((row) => {
  const isOpen = expanded.has(row.id);
  return (
    <Fragment key={row.id}>
      <tr className="border-b text-xs">
        <td className="py-2 pr-1">
          <button
            type="button"
            aria-label={isOpen ? "Collapse details" : "Expand details"}
            aria-expanded={isOpen}
            onClick={() => toggleExpand(row.id)}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          >
            {isOpen ? "▾" : "▸"}
          </button>
        </td>
        <td className="py-2 pr-3 font-mono">
          {new Date(row.occurred_at).toLocaleString()}
        </td>
        <td className="py-2 pr-3 font-mono">{row.action}</td>
        <td className="py-2 pr-3">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${resultClasses(row.result)}`}
          >
            {row.result}
          </span>
        </td>
        <td className="py-2 pr-3 font-mono">
          {row.actor_type}:{row.actor_id.slice(0, 8)}
        </td>
        <td className="py-2 pr-3 font-mono">{row.entry_token.slice(0, 16)}</td>
        <td className="py-2 font-mono">
          {row.previous_status} → {row.new_status}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b bg-muted/30">
          <td></td>
          <td colSpan={6} className="py-2 pr-3">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-[0.7rem] font-mono">
              {JSON.stringify(row.details_json, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </Fragment>
  );
})}
```

- [ ] **Step 4: Add `Fragment` to the React import**

Top of file currently:

```tsx
import { useParams } from "next/navigation";
import { useState } from "react";
```

Replace the React import with:

```tsx
import { useParams } from "next/navigation";
import { Fragment, useState } from "react";
```

- [ ] **Step 5: Verify typecheck, lint, prettier, tests**

```bash
cd frontend
pnpm typecheck
pnpm lint
pnpm prettier --check app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/audit/page.tsx
pnpm test
```

Expect: all green.

- [ ] **Step 6: Manual smoke — expand a row**

```bash
cd frontend
pnpm dev
```

Open `http://localhost:3000/orgs/<slug>/events/<eventSlug>/audit`. Confirm:

- Each row has a `▸` chevron in the leftmost column.
- Clicking the chevron flips it to `▾` and reveals an expanded row directly below with `details_json` pretty-printed as JSON.
- Clicking again collapses it.
- Multiple rows can be expanded independently.
- Switching filter chips (`All` / `Check-ins` / `Walk-ins` / `Help desk`) preserves the table; expansion state may reset, that's fine.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/audit/page.tsx
git commit -m "feat(audit): expandable rows surfacing details_json"
```

---

## Task 0d — Plan F verification checklist hygiene patches

> Three textual fixes to `docs/plans/2026-05-21-plan-f-verification-checklist.md` surfaced during Plan F verification. Docs-only.

**Files:**
- Modify: `docs/plans/2026-05-21-plan-f-verification-checklist.md`

- [ ] **Step 1: Fix the cookie name throughout Section 1**

The checklist uses `Cookie: access=$ACCESS_COOKIE` everywhere. The actual `settings.JWT_ACCESS_COOKIE` value is `eventgate_access` (confirmed in `backend/config/settings/base.py:161`). Find every occurrence of:

```
Cookie: access=$ACCESS_COOKIE
```

…and replace with:

```
Cookie: eventgate_access=$ACCESS_COOKIE
```

There are ~9 occurrences across Sections 1, 2, and 5 — all in curl commands. The variable name `$ACCESS_COOKIE` itself stays; only the cookie key changes.

Also update the cookie-capture instruction (currently at line ~125):

```
- [ ] **Login as the org owner** in the browser, then capture a JWT cookie value into a curl-friendly form. Easiest: open DevTools → Application → Cookies → copy the `access` cookie value:
```

Change `access` (in the prose) to `eventgate_access`:

```
- [ ] **Login as the org owner** in the browser, then capture a JWT cookie value into a curl-friendly form. Easiest: open DevTools → Application → Cookies → copy the `eventgate_access` cookie value:
```

- [ ] **Step 2: Add JWT TTL callout to Section 0 / start of Section 1**

`SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]` is 15 minutes (confirmed at `backend/config/settings/base.py:148`). Add a callout right under the Section 1 heading (line 98). Insert after the existing `## Section 1 — Backend endpoint smoke tests` line:

```markdown
## Section 1 — Backend endpoint smoke tests

> ⚠️ **JWT access tokens TTL = 15 minutes.** If the curl block at the end of this section returns 401, the cookie expired during your verification run. Re-capture the `eventgate_access` cookie value from DevTools and rerun. Sections 2–5 may also need a fresh cookie if you've been working in the UI for >15 minutes.
```

- [ ] **Step 3: Add IndexedDB devtools caveat to Section 6d**

Section 6d (line ~382, `### 6d — Retry-failed affordance`) currently asks the verifier to check IndexedDB. Add a sub-callout right under the `### 6d — Retry-failed affordance` heading explaining DevTools doesn't auto-refresh and how to query directly:

```markdown
### 6d — Retry-failed affordance

> ℹ️ **DevTools IndexedDB caveat:** the Application → IndexedDB panel does NOT auto-refresh after writes. Right-click the store and "Refresh" between steps, or query directly from the JS console:
>
> ```js
> const db = await indexedDB.open("eventgate", 1).then((req) => new Promise((r) => (req.onsuccess = () => r(req.result))));
> const tx = db.transaction("mutation_queue", "readonly");
> const rows = await new Promise((r) => {
>   const req = tx.objectStore("mutation_queue").getAll();
>   req.onsuccess = () => r(req.result);
> });
> console.table(rows);
> ```
```

(Adjust the database name / version / store name to match the project — read `frontend/lib/db.ts` or equivalent to confirm. The agent should grep for `indexedDB.open(` and `mutation_queue` to find the correct names and substitute them into the snippet rather than copy the placeholder values.)

- [ ] **Step 4: Verify prettier passes on the markdown**

```bash
cd frontend
pnpm prettier --check ../docs/plans/2026-05-21-plan-f-verification-checklist.md
```

Expect: pass. If `prettier` complains, run with `--write` to fix.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-05-21-plan-f-verification-checklist.md
git commit -m "docs(plan-f): hygiene patches to verification checklist (cookie name, JWT TTL, IndexedDB caveat)"
```

---

## Task 0e — Cross-device re-verification methodology doc

> `checkin.conflict` and the walk-in flow were last explicitly verified at `825b7e6` (pre-Plan-F). Plan F verification accepted them as implicitly passed. Write a step-by-step methodology doc the user can run manually with two scanner instances + a tablet; findings get logged into a follow-up `-findings.md`.

**Files:**
- Create: `docs/plans/2026-05-22-plan-f-cross-device-reverification.md`

- [ ] **Step 1: Write the methodology doc**

Create `docs/plans/2026-05-22-plan-f-cross-device-reverification.md` with the following content (substitute concrete URLs / org slugs / event slugs after grepping the seed data — the agent should look at `backend/apps/*/management/commands/seed*.py` or `dev_seed.py` for the seeded `org_slug` and `event_slug`, and substitute `<org-slug>` and `<event-slug>` placeholders in the doc text with the real values, leaving the README of the doc itself self-contained):

```markdown
# Plan F — Cross-device re-verification methodology

> **Status:** methodology only — no code changes. Findings get logged into a sibling `docs/plans/2026-05-22-plan-f-cross-device-reverification-findings.md` as you run it.

## What this re-verifies

Two flows that Plan F accepted as implicitly passing but were last explicitly verified at commit `825b7e6` (pre-Plan-F):

1. **`checkin.conflict`** — two scanner instances try to check the same token in within the same offline-replay window; one wins, the other gets a `conflict` result.
2. **Walk-in flow end-to-end** — a tablet displays the live event queue, an operator claims a walk-in slot, and the info-collection form completes the registration.

If either flow regressed during Plan F (helpdesk/audit/dashboard polling changes), we want to know before Plan G headline work lands more change on top.

---

## Setup (one-time, ~10 min)

- [ ] **Backend running**

  ```bash
  docker compose up -d
  ```

  Confirm `http://localhost:8000/api/v1/health/` returns 200.

- [ ] **Frontend dev server**

  ```bash
  cd frontend
  pnpm dev
  ```

  Confirm `http://localhost:3000` loads the login page.

- [ ] **Seed an event with two pre-registered guests**

  Use the existing seed (`uv run python manage.py seed_dev` or whatever the repo's seed command is — grep `manage.py` if unsure). Confirm the event has at least:
  - Guest A: pre-registered, status `not_checked_in`, with a printable `entry_token`
  - Guest B: pre-registered, status `not_checked_in`, with a printable `entry_token`
  - Walk-in capacity > 0 (check event `walkin_capacity` field if surfaced)

- [ ] **Two scanner instances**

  Open two browser windows (or one window + one incognito) at the scanner URL: `/orgs/<org-slug>/events/<event-slug>/scan`. Enroll each as a separate device — they should land with different `scanner_id` values. Confirm both have offline support enabled (service worker installed).

- [ ] **One tablet display window**

  Open a third window at `/orgs/<org-slug>/events/<event-slug>/walkins` (or whichever route Plan D / Plan E shipped for the walk-in tablet display — grep the frontend `app/(app)/orgs/.../events/.../` directory tree to confirm the exact route).

---

## Flow 1 — `checkin.conflict` (two scanners, same token)

- [ ] **Step 1a: Put both scanners offline simultaneously**

  In each scanner window: DevTools → Network → "Offline" checkbox. Confirm the page UI shows the offline indicator and that subsequent scans get queued locally (Dexie `mutation_queue`).

- [ ] **Step 1b: Scan Guest A's token in scanner #1**

  Type or simulate the token entry. The UI should show "queued" / "pending sync" / similar. In DevTools → IndexedDB → `mutation_queue`, confirm one new row with `status="pending"`, `target_token=<Guest A's token>`.

- [ ] **Step 1c: Scan Guest A's token in scanner #2**

  Same as 1b. Each scanner has its own IndexedDB; both should now hold an outstanding mutation for the same token.

- [ ] **Step 1d: Bring scanner #1 online, wait for queue drain**

  Uncheck DevTools "Offline" in scanner #1. Watch the `mutation_queue` row transition `pending` → `in_flight` → row deleted. The scanner UI should show "Checked in" for Guest A.

- [ ] **Step 1e: Bring scanner #2 online**

  Uncheck "Offline" in scanner #2. The replay attempt will hit `POST /api/v1/scanner/checkins/` with Guest A's token a second time. Expected:
  - Backend returns 200 with `result: "conflict"` (or 409 — record exact status).
  - Scanner #2 surfaces the conflict in the UI: a banner or list entry tagged "conflict" / "already checked in".
  - An `audit_event` row exists with `action="checkin.conflict"` and `result="warning"` (verify in `/orgs/<slug>/events/<slug>/audit`).

- [ ] **Step 1f: Log findings**

  In `docs/plans/2026-05-22-plan-f-cross-device-reverification-findings.md`, record: backend status code, exact UI affordance, audit row presence/absence, anything surprising.

---

## Flow 2 — Walk-in flow (tablet display + claim + info form)

- [ ] **Step 2a: Confirm walk-in tablet display lists open slots**

  Tablet window at `/orgs/<org-slug>/events/<event-slug>/walkins` shows the configured walk-in capacity and a live count of unclaimed slots.

- [ ] **Step 2b: Claim a walk-in slot from a scanner**

  From scanner #1 (online): trigger the walk-in path — typically a "Walk-in" button somewhere in the scanner UI. Pick an unclaimed slot. The tablet display should update within ~5 seconds (5s polling per Plan F Task 10's dashboard widget polling interval, or whichever interval the walk-in route uses — grep `refetchInterval` in `frontend/app/(app)/orgs/.../walkins/`).

- [ ] **Step 2c: Walk-in guest fills the info form**

  On the scanner (or a separate "guest form" device if Plan D set one up that way), fill in: full name, email, phone/chat handle. Submit. Confirm:
  - Backend returns 200 with a new guest record (`guest_type="walk_in"`, `entry_status="checked_in"`).
  - An audit row with `action="walkin.created"` (or `walkin.checked_in` — check Plan D for the exact action name) lands.
  - Tablet display decrements unclaimed-slot count.

- [ ] **Step 2d: Edge — claim past capacity**

  If the event has 10 walk-in slots and 10 are already claimed, attempting to claim an 11th should be rejected. Confirm:
  - Backend returns 400 or 409 with a clear error message.
  - Scanner UI surfaces the rejection.
  - Tablet display shows "full" / "no slots available".

- [ ] **Step 2e: Log findings**

  Same findings file as Flow 1. Record happy-path outcome, edge-case outcome, polling latency observed.

---

## Pass criteria

- Flow 1: scanner #2 displays "conflict" and an `audit.checkin.conflict` row exists. Sign off in the findings doc.
- Flow 2: happy path completes, capacity edge is rejected, tablet polls correctly. Sign off in the findings doc.

If either fails, file the regression as a Plan G Task 0 follow-up (NOT as part of the Telegram/CSV headline scope).
```

- [ ] **Step 2: Verify the doc renders cleanly**

```bash
cd frontend
pnpm prettier --check ../docs/plans/2026-05-22-plan-f-cross-device-reverification.md
```

Expect: pass. If not, run `--write` to format.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-05-22-plan-f-cross-device-reverification.md
git commit -m "docs(plan-f): cross-device re-verification methodology (checkin.conflict + walk-in flow)"
```

> **Hand-off:** after this commit, the user runs the methodology manually with two scanner instances + a tablet, then creates the sibling `-findings.md` doc with results. That manual run is OUT of this task — the deliverable here is the methodology doc only.

---

## Acceptance criteria (whole wave)

- 0a: `pnpm-lock.yaml` no longer contains `swr`; helpdesk page still polls every 5s; `pnpm typecheck && pnpm lint && pnpm test` all green.
- 0b: `pre-commit run frontend-prettier-check --all-files` passes on a clean tree; deliberately mis-formatted file fails the hook.
- 0c: Audit page rows have a chevron toggle; clicking reveals `details_json` pretty-printed; multiple expansions independent.
- 0d: All curl examples in the verification checklist use `Cookie: eventgate_access=…`; JWT TTL callout present at top of Section 1; IndexedDB devtools caveat present in Section 6d.
- 0e: `docs/plans/2026-05-22-plan-f-cross-device-reverification.md` exists with two complete flows (conflict + walk-in) and explicit pass criteria.
- All 5 commits use the conventional-commit format with no `Co-Authored-By` trailer.

---

## After the wave merges

Kick off Plan G headline brainstorming per brief §12 W12: Telegram + CSV import. Open design questions to brainstorm:

- Telegram entry point: bot vs deep-link from email vs widget?
- Telegram identity binding to a `Guest` row: by handle, by phone, or both?
- CSV import column schema — match the existing guest fields exactly, or accept a configurable column mapping?
- CSV error handling — fail whole file vs partial import with error report row-by-row?
- Where in the org dashboard does CSV import live? New top-level nav, or nested under event detail?

(These are Plan G headline scope, NOT this Task 0 wave.)
