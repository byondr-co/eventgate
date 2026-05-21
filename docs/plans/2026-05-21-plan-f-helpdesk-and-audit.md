# Plan F — Help desk + audit viewer + dashboard polling + Plan E carryovers

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Per-task worktree pattern from Plan E: each task → `Agent` tool with `isolation: "worktree"` + relative paths only in prompts; spec + quality review subagents after each implementer; merge agent's branch into `main` via rebase + ff-only. Independent tasks dispatched in parallel waves where they touch disjoint files.

**Goal:** Ship the operator-facing surfaces for door-day exception handling — help-desk inbox, audit viewer, manual-review queue, live dashboard counts — backed by DB-level append-only enforcement on `audit_events`. Bundle the Plan E verification carry-overs as a Task 0 wave so the scanner PWA enters Plan G with a clean parking lot.

**Architecture:**

- **Hybrid help-desk data model.** `AuditEvent` remains the immutable signal (the row written when a scanner taps "Send to help desk"). A new `HelpDeskTicketState` row keyed by `audit_event_id` holds the mutable bits — claim status, assignee, resolution. Reads `JOIN` the two; writes hit each table once.
- **Unified inbox UI.** One `/orgs/<slug>/events/<eventSlug>/helpdesk` page lists both `checkin.help_desk_escalation` audit rows AND guests with `entry_status="manual_review"`, with filter chips (`All open` / `Escalations` / `Manual review` / `Resolved`). Staff don't navigate between pages mid-rush.
- **Belt-and-suspenders append-only.** One migration installs a `BEFORE UPDATE OR DELETE` trigger that raises an exception, AND issues `REVOKE UPDATE, DELETE ON audit_auditevent FROM <app_role>`. The trigger catches all connections (including `flyctl ssh psql` shells); the REVOKE adds role-level defense in depth.
- **5s GET polling with ETag/304.** The `/stats/` endpoint serves the dashboard counts widget. ETag derives from `max(audit_auditevent.id, ...) + event.updated_at`. The audit viewer's list endpoint shares the same ETag strategy.
- **Resolve actions emit audit rows.** Every `claim/release/resolve` action writes a `helpdesk.*` audit row so the narrative remains complete and the audit log stays the source of truth.

**Tech Stack:** Django 5 + DRF, Postgres (Neon), Next.js 16 + React 19 + Tailwind v4 + shadcn/ui, Workbox + Dexie 4 (frontend), pytest + Vitest, Fly + Vercel.

---

## Scope summary (locked at brainstorming)

**Headline (per brief §12 W11):**

1. Task 1 — DB append-only on `audit_auditevent` (trigger + REVOKE)
2. Task 2 — `HelpDeskTicketState` model + data backfill
3. Task 3 — Extend `POST /api/v1/scanner/escalations/` to create the state row
4. Task 4 — `GET /api/v1/orgs/<slug>/events/<eventSlug>/helpdesk/tickets/` list
5. Task 5 — `POST` claim/release/resolve endpoints + audit emission
6. Task 6 — `GET /api/v1/orgs/<slug>/events/<eventSlug>/audit/` read-only audit list
7. Task 7 — `GET /api/v1/orgs/<slug>/events/<eventSlug>/stats/` counts endpoint
8. Task 8 — `/orgs/<slug>/events/<eventSlug>/helpdesk` inbox UI (tickets, 4 chips)
9. Task 9 — `/orgs/<slug>/events/<eventSlug>/audit` viewer UI
10. Task 10 — Dashboard polling counts widget on event detail
11. Task 11 — Manual-review chip + transition endpoints (completes the locked unified-queue design)

**Task 0 wave — Plan E verification carryovers:**

- Task 0a — Verification-checklist patches (docs-only)
- Task 0b — Backend GitHub Actions auto-deploy on push to `main` touching `backend/**`
- Task 0c — iOS install banner (`display-mode: browser` + iOS UA)
- Task 0d — `in_flight` mutation reaper (startup sweep, >5min stale → `pending`)
- Task 0e — Dedupe scan mutations by `target_token`
- Task 0f — Retry-failed affordance on `/scanner/escalations`
- Task 0g — Update local guest cache after online check-in success
- Task 0h — Per-IP rate limit on `POST /api/v1/devices/enroll/`

**Total: 19 tasks.** Backend tasks follow TDD (red → green → commit). Frontend tasks are built inline by the controller. Each commit is a single-line conventional-commit subject — **no body, no `Co-Authored-By` trailer.**

---

## Suggested execution waves

The controller picks ordering at execution time; this is a hint, not a contract.

| Wave | Tasks | Reasoning |
|---|---|---|
| A (parallel) | 0a, 0b, 0c, 0h, 1, 2 | All touch disjoint files (docs / CI / scanner header / backend devices / audit migration / helpdesk model). |
| B (parallel) | 0d, 0g | 0d hits `mutation-queue.ts` startup; 0g hits the scan page + guest-cache. Disjoint. |
| C (serial after B.0d) | 0e | 0e modifies `mutation-queue.ts::enqueueCheckin`; ordering against 0d avoids merge churn. |
| D (serial after B.0d) | 0f | 0f modifies `mutation-queue.ts::retryFailed` + escalations page. |
| E (depends on 2) | 3 | Escalation endpoint needs the new model. |
| F (parallel after 3) | 4, 5, 6, 7 | List + actions + audit + stats are all read/write endpoints sharing no files. |
| G (parallel after 4, 7) | 8, 10 | Inbox UI uses Task 4 list endpoint; widget uses Task 7 stats. |
| H (depends on 6) | 9 | Audit viewer uses Task 6 list endpoint. |
| I (depends on 8) | 11 | Manual-review chip augments the Task 8 inbox + adds transition endpoints. |

---

## Pre-flight (zero tasks; do this once before kicking off Wave A)

Confirm the baseline matches the handoff snapshot:

```bash
cd /Users/vinei/Projects/eventgate
git pull
git log --oneline | head -3
# Expect: 825b7e6 docs(plan-e): verification complete — checklist + findings + parking-lot update for Plan F

docker compose up -d
cd backend && uv run pytest -q
# Expect: 172 passed (or 171 passed + 1 known concurrency flake)

cd ../frontend && pnpm install --frozen-lockfile && pnpm test
# Expect: 19 passed across 4 files
```

If any of these fail, stop and diagnose before kicking off Plan F.

---

## Task 0a — Verification-checklist patches

> Three small textual corrections to the Plan E verification checklist, surfaced during verification. Docs-only.

**Files:**
- Modify: `docs/plans/2026-05-21-plan-e-verification-checklist.md`

- [ ] **Step 1: Add the "deploy backend if backend commits since last deploy" item to Section 0**

Open `docs/plans/2026-05-21-plan-e-verification-checklist.md`. In **Section 0 (Pre-flight)**, after the line that confirms the git tip on main matches `origin/main`, insert a new checkbox item:

```markdown
- [ ] **Deploy backend if any backend commits since last Fly deploy.**

  ```bash
  cd backend && flyctl deploy --remote-only --app eventgate-backend-staging
  ```

  Verification opens with the assumption that the backend on Fly matches the git tip on `main`. Fly has no auto-deploy hook yet (Plan F Task 0b adds one); until that lands, run this step manually whenever `git log --oneline origin/main..main -- backend/` is non-empty since the last `flyctl deploy`.
```

- [ ] **Step 2: Correct `attempts` expectation**

Search the checklist for `attempts: 1` (it appears in the offline-token + happy-path sections). Replace each occurrence with `attempts: 0`. The mutation queue rows record `attempts` as the number of *retries* — first-try success/failure means `attempts: 0`, not `1`.

- [ ] **Step 3: Add Cmd+Shift+R note to Section 2 (Service worker)**

In **Section 2 (Service worker + manifest serve)**, after the bullet that walks through opening DevTools → Application → Service Workers, append a callout:

```markdown
> **Note:** Cmd+Shift+R (hard reload) bypasses the service worker entirely. If you see empty caches or absent SW behavior, check whether you hard-reloaded. Use Cmd+R or DevTools → "Update on reload" instead.
```

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-05-21-plan-e-verification-checklist.md
git commit -m "docs(plan-e): apply verification-checklist patches surfaced during Plan F"
```

---

## Task 0b — Backend auto-deploy GitHub Action

> Add `.github/workflows/deploy-backend.yml` so any push to `main` that touches `backend/**` triggers `flyctl deploy --remote-only`. Mirrors what Vercel does for the frontend.
>
> **Manual prerequisite (the human running the plan must do this once):** add `FLY_API_TOKEN` to repo secrets at https://github.com/vineidev/eventgate/settings/secrets/actions. Get a token with `flyctl auth token`.

**Files:**
- Create: `.github/workflows/deploy-backend.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/deploy-backend.yml
name: Deploy backend to Fly

on:
  push:
    branches: [main]
    paths:
      - "backend/**"
      - ".github/workflows/deploy-backend.yml"
  workflow_dispatch:

concurrency:
  group: deploy-backend
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: Deploy
        working-directory: backend
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: flyctl deploy --remote-only --app eventgate-backend-staging
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-backend.yml
git commit -m "ops(ci): auto-deploy backend to Fly on push to main touching backend/**"
```

- [ ] **Step 3: After merge to main, verify on a backend touch**

Workflow runs automatically on the next backend-touching merge. Confirm via:

```bash
gh run list --workflow deploy-backend.yml --limit 3
# Expect: latest run "completed success"
```

If it fails with "FLY_API_TOKEN: not found," the human added the secret to the wrong scope (must be repo-level, not env-level).

---

## Task 0c — iOS install banner

> Chrome on iOS doesn't fire `beforeinstallprompt`. Detect `display-mode: browser` AND iOS UA, then show a small banner ("iPhone? Tap Share → Add to Home Screen") just below the scanner header. Hide once the user is in standalone mode or dismisses it.

**Files:**
- Create: `frontend/components/scanner/ios-install-banner.tsx`
- Modify: `frontend/app/scanner/layout.tsx`
- Test: `frontend/__tests__/components/scanner/ios-install-banner.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/scanner/ios-install-banner.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IOSInstallBanner } from "@/components/scanner/ios-install-banner";

function mockMatchMedia(displayMode: "browser" | "standalone") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (q: string) => ({
      matches: q.includes(`display-mode: ${displayMode}`),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

function mockUA(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

describe("IOSInstallBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders when iOS UA + display-mode browser", () => {
    mockUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    mockMatchMedia("browser");
    render(<IOSInstallBanner />);
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });

  it("does not render in standalone mode", () => {
    mockUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    mockMatchMedia("standalone");
    render(<IOSInstallBanner />);
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
  });

  it("does not render on Android Chrome", () => {
    mockUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0");
    mockMatchMedia("browser");
    render(<IOSInstallBanner />);
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && pnpm test -- ios-install-banner
```

Expected: FAIL with `Cannot find module '@/components/scanner/ios-install-banner'`.

- [ ] **Step 3: Implement the component**

```tsx
// frontend/components/scanner/ios-install-banner.tsx
"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "scanner:ios-install-banner-dismissed";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPad on iPadOS 13+ reports as "Macintosh" but has touch.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // matchMedia covers Chrome/Edge; navigator.standalone is Safari-specific.
  const mm = window.matchMedia?.("(display-mode: standalone)");
  if (mm?.matches) return true;
  // @ts-expect-error — Safari-only property.
  return Boolean(window.navigator.standalone);
}

export function IOSInstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIOS()) return;
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-amber-700/50 bg-amber-950/40 px-4 py-2 text-xs text-amber-200"
    >
      <span>
        iPhone? Tap <span className="font-mono">Share</span> → <span className="font-mono">Add to Home Screen</span> for the full PWA.
      </span>
      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(DISMISSED_KEY, "1");
          setShow(false);
        }}
        className="font-mono text-amber-300 hover:text-amber-100"
        aria-label="Dismiss install hint"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire into the scanner layout**

In `frontend/app/scanner/layout.tsx`, add the import and render the banner directly after `<OfflineBanner />`:

```tsx
// Add to imports near the top:
import { IOSInstallBanner } from "@/components/scanner/ios-install-banner";

// In the return, replace `<OfflineBanner />` with:
<OfflineBanner />
<IOSInstallBanner />
```

- [ ] **Step 5: Run tests to verify**

```bash
cd frontend && pnpm test -- ios-install-banner
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/scanner/ios-install-banner.tsx \
        frontend/__tests__/components/scanner/ios-install-banner.test.tsx \
        frontend/app/scanner/layout.tsx
git commit -m "feat(scanner): iOS install banner for Add-to-Home-Screen hint"
```

---

## Task 0d — `in_flight` mutation reaper

> If the PWA closes between `set in_flight` and the fetch response, the row stays `in_flight` forever and `getPendingMutations()` ignores it. Add a `reapStaleInFlight()` startup sweep that resets rows >5min stale back to `pending` so the next drain picks them up.

**Files:**
- Modify: `frontend/lib/scanner/mutation-queue.ts`
- Modify: `frontend/lib/scanner/sync.ts`
- Test: `frontend/__tests__/lib/scanner/mutation-queue.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/__tests__/lib/scanner/mutation-queue.test.ts`:

```tsx
import { db } from "@/lib/scanner/db";
import { reapStaleInFlight } from "@/lib/scanner/mutation-queue";

describe("reapStaleInFlight", () => {
  beforeEach(async () => {
    await db.mutation_queue.clear();
  });

  it("resets in_flight rows older than 5 minutes to pending", async () => {
    const sixMinAgo = Date.now() - 6 * 60 * 1000;
    await db.mutation_queue.put({
      id: "stale",
      mutation_type: "checkin",
      target_token: "tok",
      client_idempotency_key: "k",
      payload: { token: "tok", gate: "G1", scanner_label: "S1", client_idempotency_key: "k" },
      status: "in_flight",
      attempts: 0,
      next_attempt_at: sixMinAgo,
      created_at: sixMinAgo,
      completed_at: null,
      last_error: null,
      server_response: null,
    });
    const n = await reapStaleInFlight();
    expect(n).toBe(1);
    const row = await db.mutation_queue.get("stale");
    expect(row?.status).toBe("pending");
  });

  it("leaves fresh in_flight rows alone", async () => {
    await db.mutation_queue.put({
      id: "fresh",
      mutation_type: "checkin",
      target_token: "tok",
      client_idempotency_key: "k",
      payload: { token: "tok", gate: "G1", scanner_label: "S1", client_idempotency_key: "k" },
      status: "in_flight",
      attempts: 0,
      next_attempt_at: Date.now(),
      created_at: Date.now(),
      completed_at: null,
      last_error: null,
      server_response: null,
    });
    const n = await reapStaleInFlight();
    expect(n).toBe(0);
    const row = await db.mutation_queue.get("fresh");
    expect(row?.status).toBe("in_flight");
  });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
cd frontend && pnpm test -- mutation-queue
```

Expected: FAIL with `reapStaleInFlight is not a function`.

- [ ] **Step 3: Implement the reaper**

Add to `frontend/lib/scanner/mutation-queue.ts`, just below the `MAX_ATTEMPTS` constant:

```ts
const REAP_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Reset `in_flight` rows that haven't moved in >5 minutes back to `pending`.
 * Runs once at startup. If the PWA died between `set in_flight` and the
 * server's response, the row would otherwise be invisible to `getPendingMutations()`
 * and stuck forever.
 *
 * Uses `next_attempt_at` (which is set to "now" the moment a row transitions
 * to in_flight via `update(..., status: "in_flight")` — note: drainQueueOnce
 * doesn't currently set next_attempt_at on this transition, so the field
 * stays at its enqueue value. That's the right behavior here: enqueue time
 * is a sufficient lower bound for "how old is this in_flight."
 */
export async function reapStaleInFlight(): Promise<number> {
  const cutoff = Date.now() - REAP_THRESHOLD_MS;
  const stale = await db.mutation_queue
    .where("status")
    .equals("in_flight")
    .filter((r) => r.created_at < cutoff)
    .toArray();
  for (const row of stale) {
    await db.mutation_queue.update(row.id, {
      status: "pending",
      next_attempt_at: Date.now(),
    });
  }
  return stale.length;
}
```

- [ ] **Step 4: Wire into the sync startup**

In `frontend/lib/scanner/sync.ts`, find the top of `startSyncLoop` (or whatever function `app/scanner/layout.tsx` imports). Add a one-shot call at the top:

```ts
import { reapStaleInFlight } from "./mutation-queue";

// At the top of startSyncLoop, before any setInterval / addEventListener wiring:
void reapStaleInFlight().catch(() => {});
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && pnpm test -- mutation-queue
```

Expected: all previous tests + 2 new reaper tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/scanner/mutation-queue.ts \
        frontend/lib/scanner/sync.ts \
        frontend/__tests__/lib/scanner/mutation-queue.test.ts
git commit -m "feat(scanner): reap in_flight mutations stale >5min on startup"
```

---

## Task 0e — Dedupe scan mutations by `target_token`

> Scanning the same QR N times offline creates N independent queue rows. For invalid-token typos this clutters the queue + Plan F's escalations UI. Short-circuit `enqueueCheckin` when an active row exists for the same `target_token`.

**Files:**
- Modify: `frontend/lib/scanner/mutation-queue.ts`
- Test: `frontend/__tests__/lib/scanner/mutation-queue.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/__tests__/lib/scanner/mutation-queue.test.ts`:

```tsx
import { enqueueCheckin } from "@/lib/scanner/mutation-queue";

describe("enqueueCheckin dedupe", () => {
  beforeEach(async () => {
    await db.mutation_queue.clear();
  });

  it("returns the existing row id if the same token is enqueued twice while pending", async () => {
    const id1 = await enqueueCheckin({ token: "same-token", gate: "G", scanner_label: "S" });
    const id2 = await enqueueCheckin({ token: "same-token", gate: "G", scanner_label: "S" });
    expect(id2).toBe(id1);
    const rows = await db.mutation_queue.where("target_token").equals("same-token").toArray();
    expect(rows).toHaveLength(1);
  });

  it("creates a new row if the prior one is completed", async () => {
    const id1 = await enqueueCheckin({ token: "done-token", gate: "G", scanner_label: "S" });
    await db.mutation_queue.update(id1, { status: "completed", completed_at: Date.now() });
    const id2 = await enqueueCheckin({ token: "done-token", gate: "G", scanner_label: "S" });
    expect(id2).not.toBe(id1);
  });

  it("does not dedupe when target_token differs", async () => {
    const id1 = await enqueueCheckin({ token: "a", gate: "G", scanner_label: "S" });
    const id2 = await enqueueCheckin({ token: "b", gate: "G", scanner_label: "S" });
    expect(id2).not.toBe(id1);
  });
});
```

- [ ] **Step 2: Verify the new tests fail**

```bash
cd frontend && pnpm test -- mutation-queue
```

Expected: dedupe tests FAIL — both calls currently produce distinct rows.

- [ ] **Step 3: Add the short-circuit to `enqueueCheckin`**

In `frontend/lib/scanner/mutation-queue.ts`, modify `enqueueCheckin` to check for an existing row before inserting:

```ts
export async function enqueueCheckin(input: EnqueueInput): Promise<string> {
  // Dedupe: if an active row already exists for this token, return its id.
  // "Active" = anything not completed/escalated. Failed rows still count so
  // the retry-failed affordance has a single row to act on.
  const existing = await db.mutation_queue
    .where("target_token")
    .equals(input.token)
    .filter((r) => r.status === "pending" || r.status === "in_flight" || r.status === "failed" || r.status === "conflict")
    .first();
  if (existing) return existing.id;

  // ... existing body unchanged from here:
  const id = uuid();
  const key = uuid();
  // ...
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && pnpm test -- mutation-queue
```

Expected: all previous tests + 3 new dedupe tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/scanner/mutation-queue.ts \
        frontend/__tests__/lib/scanner/mutation-queue.test.ts
git commit -m "feat(scanner): dedupe enqueueCheckin by target_token when active row exists"
```

---

## Task 0f — Retry-failed affordance on `/scanner/escalations`

> `failed` rows currently sit forever. Surface them with a "Retry" button that resets `status=pending`, `attempts=0`, `next_attempt_at=now` so the next drain re-attempts.

**Files:**
- Modify: `frontend/lib/scanner/mutation-queue.ts`
- Create: `frontend/components/scanner/failed-row.tsx`
- Modify: `frontend/app/scanner/escalations/page.tsx`
- Test: `frontend/__tests__/lib/scanner/mutation-queue.test.ts`

- [ ] **Step 1: Write the failing test for `retryFailedMutation`**

Append to `frontend/__tests__/lib/scanner/mutation-queue.test.ts`:

```tsx
import { retryFailedMutation } from "@/lib/scanner/mutation-queue";

describe("retryFailedMutation", () => {
  beforeEach(async () => {
    await db.mutation_queue.clear();
  });

  it("resets a failed row to pending with attempts=0", async () => {
    await db.mutation_queue.put({
      id: "f1",
      mutation_type: "checkin",
      target_token: "tok",
      client_idempotency_key: "k",
      payload: { token: "tok", gate: "G", scanner_label: "S", client_idempotency_key: "k" },
      status: "failed",
      attempts: 8,
      next_attempt_at: Date.now() - 10000,
      created_at: Date.now() - 60000,
      completed_at: Date.now() - 1000,
      last_error: "token_not_recognised",
      server_response: null,
    });
    await retryFailedMutation("f1");
    const row = await db.mutation_queue.get("f1");
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
    expect(row?.completed_at).toBeNull();
    expect(row?.last_error).toBeNull();
  });

  it("is a no-op on non-failed rows", async () => {
    await db.mutation_queue.put({
      id: "c1",
      mutation_type: "checkin",
      target_token: "t",
      client_idempotency_key: "k",
      payload: { token: "t", gate: "G", scanner_label: "S", client_idempotency_key: "k" },
      status: "completed",
      attempts: 0,
      next_attempt_at: Date.now(),
      created_at: Date.now(),
      completed_at: Date.now(),
      last_error: null,
      server_response: null,
    });
    await retryFailedMutation("c1");
    const row = await db.mutation_queue.get("c1");
    expect(row?.status).toBe("completed");
  });
});
```

- [ ] **Step 2: Verify test fails**

```bash
cd frontend && pnpm test -- mutation-queue
```

Expected: FAIL with `retryFailedMutation is not a function`.

- [ ] **Step 3: Implement `retryFailedMutation` + `getFailedMutations`**

Add to `frontend/lib/scanner/mutation-queue.ts`:

```ts
export async function getFailedMutations(): Promise<QueuedMutation[]> {
  return db.mutation_queue.where("status").equals("failed").toArray();
}

export async function retryFailedMutation(id: string): Promise<void> {
  const row = await db.mutation_queue.get(id);
  if (!row || row.status !== "failed") return;
  await db.mutation_queue.update(id, {
    status: "pending",
    attempts: 0,
    next_attempt_at: Date.now(),
    completed_at: null,
    last_error: null,
  });
}
```

- [ ] **Step 4: Build the FailedRow component**

```tsx
// frontend/components/scanner/failed-row.tsx
"use client";

import { useState } from "react";

import { type QueuedMutation } from "@/lib/scanner/db";
import { retryFailedMutation } from "@/lib/scanner/mutation-queue";

type Props = {
  row: QueuedMutation;
  onDone: () => void;
};

export function FailedRow({ row, onDone }: Props) {
  const [busy, setBusy] = useState(false);

  const handleRetry = async () => {
    setBusy(true);
    try {
      await retryFailedMutation(row.id);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-red-700/50 bg-red-950/30 p-4 text-sm">
      <div className="mb-2 font-mono text-xs text-red-300">FAILED</div>
      <div className="space-y-1">
        <div>
          <span className="text-neutral-400">Token:</span>{" "}
          <span className="font-mono text-xs">{row.target_token.slice(0, 16)}…</span>
        </div>
        <div>
          <span className="text-neutral-400">Reason:</span> {row.last_error ?? "unknown"}
        </div>
        <div className="text-xs text-neutral-500">
          Scanned at {new Date(row.created_at).toLocaleTimeString()} · attempts={row.attempts}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleRetry()}
        className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Retry
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Render failed rows on the escalations page**

In `frontend/app/scanner/escalations/page.tsx`, add the `FailedRow` import and a second list below the conflicts list:

```tsx
// Imports
import { FailedRow } from "@/components/scanner/failed-row";
import { getConflictMutations, getFailedMutations } from "@/lib/scanner/mutation-queue";

// Inside EscalationsPage, alongside the existing rows state:
const [failed, setFailed] = useState<QueuedMutation[]>([]);

// In the load effect, in addition to getConflictMutations:
useEffect(() => {
  let active = true;
  const load = async () => {
    const [conf, fail] = await Promise.all([getConflictMutations(), getFailedMutations()]);
    if (!active) return;
    setRows(conf);
    setFailed(fail);
  };
  void load();
  return () => {
    active = false;
  };
}, [tick]);

// In the return, after the conflicts <ul>:
{failed.length > 0 ? (
  <>
    <h2 className="mt-6 mb-3 text-sm font-semibold text-neutral-300">Failed</h2>
    <ul className="space-y-3">
      {failed.map((r) => (
        <li key={r.id}>
          <FailedRow row={r} onDone={() => void refresh()} />
        </li>
      ))}
    </ul>
  </>
) : null}
```

- [ ] **Step 6: Update the empty-state copy on the escalations page**

The current copy says "No conflicts." With failed rows in the mix, update it:

```tsx
{rows.length === 0 && failed.length === 0 ? (
  <p className="text-sm text-neutral-400">
    Nothing to escalate. When an offline check-in clashes with another device or exhausts its
    retry budget, it shows up here.
  </p>
) : null}
```

(Adjust the existing `rows.length === 0` ternary to use the combined condition.)

- [ ] **Step 7: Run tests + manual smoke**

```bash
cd frontend && pnpm test -- mutation-queue
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/scanner/mutation-queue.ts \
        frontend/components/scanner/failed-row.tsx \
        frontend/app/scanner/escalations/page.tsx \
        frontend/__tests__/lib/scanner/mutation-queue.test.ts
git commit -m "feat(scanner): retry-failed affordance on /scanner/escalations"
```

---

## Task 0g — Update local guest cache after online check-in success

> The offline scan path already calls `markCachedGuestCheckedIn` (via `enqueueCheckin`). The online path doesn't, so the local cache stays stale until the next 5-min refresh / `online` / `visibilitychange` event. Add the cache update to the online success branch in the scan page.

**Files:**
- Modify: `frontend/app/scanner/scan/page.tsx`

- [ ] **Step 1: Add the import**

In `frontend/app/scanner/scan/page.tsx`, add `markCachedGuestCheckedIn` to the existing `guest-cache` import:

```tsx
import { lookupGuestByToken, markCachedGuestCheckedIn } from "@/lib/scanner/guest-cache";
```

- [ ] **Step 2: Call the cache update on success**

In `submitToken`, inside the online branch (`if (navigator.onLine) { … }`), find where the `postCheckin` result is set on state. Immediately after a successful result, write the cache:

```tsx
if (navigator.onLine) {
  const result = await postCheckin({
    token: rawToken,
    gate: device.label ?? "",
    scanner_label: device.label ?? "",
    client_idempotency_key: uuid(),
  });
  setOutcome(result);
  if (result.kind === "success") {
    await markCachedGuestCheckedIn(rawToken).catch(() => {});
  }
  if (result.kind === "session_expired") {
    setTimeout(() => router.replace("/scanner/unlock"), RESULT_CARD_MS);
  }
  return;
}
```

- [ ] **Step 3: Verify behavior manually**

The behavior is observable from DevTools → Application → IndexedDB → `scanner_db` → `guests`. Online-scan a guest whose cached `entry_status` was `registered_not_arrived`; the cached row should flip to `checked_in` without waiting for the 5-min refresh.

- [ ] **Step 4: Run the existing frontend tests to confirm nothing broke**

```bash
cd frontend && pnpm test
```

Expected: 19+ tests pass (no new tests; this is a single one-line addition to an existing flow).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/scanner/scan/page.tsx
git commit -m "feat(scanner): update local guest cache after online check-in success"
```

---

## Task 0h — Per-IP rate limit on `POST /api/v1/devices/enroll/`

> Single-use enrollment codes already mitigate code-guessing, but cap requests per IP as defense in depth. Use DRF's `SimpleRateThrottle` with `cache='default'` (Django's locmem in tests, Redis in prod).

**Files:**
- Modify: `backend/apps/devices/views.py`
- Create: `backend/apps/devices/throttles.py`
- Test: `backend/tests/test_devices_enroll_rate_limit.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_devices_enroll_rate_limit.py
"""POST /api/v1/devices/enroll/ — per-IP rate limit.

Defense in depth alongside single-use enrollment codes. Cap is generous
(10/min) — operator typing in an enrollment code by hand should never hit it.
"""

from __future__ import annotations

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_enroll_rate_limit_kicks_in_at_11th_request():
    c = APIClient(REMOTE_ADDR="10.0.0.1")
    last = None
    for _ in range(10):
        last = c.post("/api/v1/devices/enroll/", {"enrollment_code": "bad"}, format="json")
        assert last.status_code == 404, last.status_code
    blocked = c.post("/api/v1/devices/enroll/", {"enrollment_code": "bad"}, format="json")
    assert blocked.status_code == 429, blocked.status_code


@pytest.mark.django_db
def test_enroll_rate_limit_is_per_ip():
    c1 = APIClient(REMOTE_ADDR="10.0.0.1")
    c2 = APIClient(REMOTE_ADDR="10.0.0.2")
    for _ in range(10):
        c1.post("/api/v1/devices/enroll/", {"enrollment_code": "bad"}, format="json")
    # c1 is at its limit, but c2 should still be allowed:
    r = c2.post("/api/v1/devices/enroll/", {"enrollment_code": "bad"}, format="json")
    assert r.status_code == 404
```

- [ ] **Step 2: Verify the test fails**

```bash
cd backend && uv run pytest tests/test_devices_enroll_rate_limit.py -v
```

Expected: FAIL — `blocked.status_code == 429` is `404` (no throttle yet).

- [ ] **Step 3: Implement the throttle class**

```python
# backend/apps/devices/throttles.py
"""Throttles scoped to the device enrollment path.

Single-use enrollment codes already prevent replay; this caps the rate of
*attempts* against the endpoint per IP.
"""

from __future__ import annotations

from rest_framework.throttling import SimpleRateThrottle


class DeviceEnrollIPThrottle(SimpleRateThrottle):
    scope = "device_enroll"
    rate = "10/min"

    def get_cache_key(self, request, view) -> str:
        ip = self.get_ident(request)
        return f"throttle:{self.scope}:{ip}"
```

- [ ] **Step 4: Wire the throttle into `DeviceEnrollView`**

In `backend/apps/devices/views.py`, modify `DeviceEnrollView`:

```python
from apps.devices.throttles import DeviceEnrollIPThrottle

class DeviceEnrollView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []
    throttle_classes = (DeviceEnrollIPThrottle,)
    # ... rest unchanged
```

- [ ] **Step 5: Run the test**

```bash
cd backend && uv run pytest tests/test_devices_enroll_rate_limit.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

```bash
cd backend && uv run pytest -q
```

Expected: 174 passed (was 172; +2 new throttle tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/devices/views.py \
        backend/apps/devices/throttles.py \
        backend/tests/test_devices_enroll_rate_limit.py
git commit -m "feat(devices): per-IP rate limit on POST /devices/enroll/ (10/min)"
```

---

## Task 1 — DB append-only enforcement on `audit_auditevent`

> Install a `BEFORE UPDATE OR DELETE` trigger on `audit_auditevent` that raises an exception, plus `REVOKE UPDATE, DELETE` for the app role. The trigger catches all connections (including ops shells); the REVOKE adds role-level defense in depth.
>
> **Naming note:** the brief refers to the table as `audit_events`, but Django uses the default `<app_label>_<model_name>` = `audit_auditevent`. We use the actual table name.

**Files:**
- Create: `backend/apps/audit/migrations/0002_append_only_trigger.py`
- Modify: `backend/apps/audit/models.py` (remove the "deferred to Plan F" comment)
- Test: `backend/tests/test_audit_append_only.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_audit_append_only.py
"""DB-level append-only enforcement on audit_auditevent.

Verifies the BEFORE UPDATE OR DELETE trigger raises an exception even when
the SQL is issued directly (bypassing the app's write_audit() guard).
"""

from __future__ import annotations

import pytest
from django.db import IntegrityError, connection, transaction

from apps.audit.services import write_audit
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_direct_update_raises():
    org = Organization.objects.create(name="Acme", slug="acme")
    row = write_audit(
        organization=org,
        actor_type="system",
        actor_id="test",
        action="checkin.success",
        result="success",
    )
    with pytest.raises(Exception) as exc, transaction.atomic():
        with connection.cursor() as cur:
            cur.execute(
                "UPDATE audit_auditevent SET action = %s WHERE id = %s",
                ["tampered", str(row.id)],
            )
    # Either IntegrityError (from raise_exception in plpgsql) or generic DB error.
    assert "audit" in str(exc.value).lower() or "append" in str(exc.value).lower()


@pytest.mark.django_db
def test_direct_delete_raises():
    org = Organization.objects.create(name="Acme", slug="acme")
    row = write_audit(
        organization=org,
        actor_type="system",
        actor_id="test",
        action="checkin.success",
        result="success",
    )
    with pytest.raises(Exception) as exc, transaction.atomic():
        with connection.cursor() as cur:
            cur.execute("DELETE FROM audit_auditevent WHERE id = %s", [str(row.id)])
    assert "audit" in str(exc.value).lower() or "append" in str(exc.value).lower()


@pytest.mark.django_db
def test_insert_still_works():
    org = Organization.objects.create(name="Acme", slug="acme")
    row = write_audit(
        organization=org,
        actor_type="system",
        actor_id="test",
        action="checkin.success",
        result="success",
    )
    assert row.id is not None
```

- [ ] **Step 2: Verify the test fails**

```bash
cd backend && uv run pytest tests/test_audit_append_only.py -v
```

Expected: FAIL — direct UPDATE/DELETE currently succeed.

- [ ] **Step 3: Write the migration**

```python
# backend/apps/audit/migrations/0002_append_only_trigger.py
"""Append-only enforcement on audit_auditevent.

Belt-and-suspenders:
  (a) BEFORE UPDATE OR DELETE trigger raises an exception. Catches all
      connections, including direct psql shells.
  (b) REVOKE UPDATE, DELETE on the app role. Adds role-level defense in depth.

The trigger function is a plain plpgsql RAISE EXCEPTION — explicit, no
fancy bypass mechanism. If a future migration legitimately needs to mutate
audit rows (e.g., schema evolution), it must `DROP TRIGGER`, do the work,
and `CREATE TRIGGER` again as the last step.
"""

from __future__ import annotations

from django.db import migrations

FORWARD_SQL = """
CREATE OR REPLACE FUNCTION audit_prevent_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_auditevent is append-only (TG_OP=%)', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_auditevent_append_only ON audit_auditevent;
CREATE TRIGGER audit_auditevent_append_only
    BEFORE UPDATE OR DELETE ON audit_auditevent
    FOR EACH ROW EXECUTE FUNCTION audit_prevent_mutation();

-- Role-level defense in depth. Find the current user (the role Django runs
-- as) and revoke UPDATE/DELETE on this table for it. SELECT/INSERT remain.
DO $$
DECLARE
    app_role text := current_user;
BEGIN
    EXECUTE format('REVOKE UPDATE, DELETE ON TABLE audit_auditevent FROM %I', app_role);
EXCEPTION WHEN OTHERS THEN
    -- Role might not have the grants yet (fresh DB) — that's fine.
    NULL;
END $$;
"""

REVERSE_SQL = """
DROP TRIGGER IF EXISTS audit_auditevent_append_only ON audit_auditevent;
DROP FUNCTION IF EXISTS audit_prevent_mutation();

DO $$
DECLARE
    app_role text := current_user;
BEGIN
    EXECUTE format('GRANT UPDATE, DELETE ON TABLE audit_auditevent TO %I', app_role);
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]
    operations = [migrations.RunSQL(FORWARD_SQL, reverse_sql=REVERSE_SQL)]
```

- [ ] **Step 4: Update the model docstring**

In `backend/apps/audit/models.py`, remove the "deferred to Plan F" note from the `AuditEvent` docstring:

```python
class AuditEvent(models.Model):
    """Append-only audit row. write_audit() is the only sanctioned writer.

    DB-level enforcement: a BEFORE UPDATE OR DELETE trigger raises an
    exception (migration 0002). The app's write_audit() guard remains the
    primary call site; the trigger is defense in depth.
    """
```

- [ ] **Step 5: Run the test**

```bash
cd backend && uv run pytest tests/test_audit_append_only.py -v
```

Expected: 3 passed.

- [ ] **Step 6: Full suite check**

```bash
cd backend && uv run pytest -q
```

Expected: 177 passed (was 174 after Task 0h; +3 new append-only tests). One known concurrency flake.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/audit/migrations/0002_append_only_trigger.py \
        backend/apps/audit/models.py \
        backend/tests/test_audit_append_only.py
git commit -m "feat(audit): DB-level append-only enforcement (trigger + REVOKE)"
```

---

## Task 2 — `HelpDeskTicketState` model + data backfill

> New Django app `apps.helpdesk` with one model: `HelpDeskTicketState`, keyed 1:1 by `audit_event_id` (the escalation audit row's UUID). Stores the mutable bits — claim status, assignee, resolution. Data migration backfills one state row per existing `checkin.help_desk_escalation` audit row (the 2 rows already on staging from Plan E verification).

**Files:**
- Create: `backend/apps/helpdesk/__init__.py`
- Create: `backend/apps/helpdesk/apps.py`
- Create: `backend/apps/helpdesk/models.py`
- Create: `backend/apps/helpdesk/admin.py`
- Create: `backend/apps/helpdesk/migrations/__init__.py`
- Create: `backend/apps/helpdesk/migrations/0001_initial.py`
- Create: `backend/apps/helpdesk/migrations/0002_backfill_existing_escalations.py`
- Modify: `backend/config/settings/base.py` (add `"apps.helpdesk"` to INSTALLED_APPS)
- Test: `backend/tests/test_helpdesk_ticket_state_model.py`
- Test: `backend/tests/test_helpdesk_backfill.py`

- [ ] **Step 1: Write the failing model test**

```python
# backend/tests/test_helpdesk_ticket_state_model.py
"""HelpDeskTicketState model — mutable side state for help-desk escalations."""

from __future__ import annotations

import pytest

from apps.audit.services import write_audit
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_create_state_from_audit_row():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="dev1",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    state = HelpDeskTicketState.objects.create(
        audit_event=audit,
        organization=org,
        event=event,
        claim_status="open",
    )
    assert state.id is not None
    assert state.claim_status == "open"
    assert state.audit_event_id == audit.id


@pytest.mark.django_db
def test_one_state_per_audit_row():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="dev1",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    HelpDeskTicketState.objects.create(
        audit_event=audit, organization=org, event=event, claim_status="open"
    )
    from django.db import IntegrityError

    with pytest.raises(IntegrityError):
        HelpDeskTicketState.objects.create(
            audit_event=audit, organization=org, event=event, claim_status="open"
        )


@pytest.mark.django_db
def test_default_claim_status_is_open():
    org = Organization.objects.create(name="A", slug="a")
    event = Event.objects.create(organization=org, name="D", slug="d")
    audit = write_audit(
        organization=org,
        event=event,
        actor_type="scanner_device",
        actor_id="dev1",
        action="checkin.help_desk_escalation",
        result="warning",
    )
    state = HelpDeskTicketState.objects.create(audit_event=audit, organization=org, event=event)
    assert state.claim_status == "open"
```

- [ ] **Step 2: Verify test fails**

```bash
cd backend && uv run pytest tests/test_helpdesk_ticket_state_model.py -v
```

Expected: FAIL — `apps.helpdesk` doesn't exist.

- [ ] **Step 3: Create the app skeleton**

```python
# backend/apps/helpdesk/__init__.py
# (empty)
```

```python
# backend/apps/helpdesk/apps.py
from django.apps import AppConfig


class HelpdeskConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.helpdesk"
```

```python
# backend/apps/helpdesk/migrations/__init__.py
# (empty)
```

- [ ] **Step 4: Write the model**

```python
# backend/apps/helpdesk/models.py
"""Mutable side state for help-desk escalations.

The immutable signal lives in apps.audit.AuditEvent rows with
action="checkin.help_desk_escalation". This table layers the mutable bits
(claim status, assignee, resolution) on top, keyed 1:1 by audit_event_id.

Append-only audit constraint is preserved: state transitions on this table
emit *additional* AuditEvent rows (e.g. helpdesk.ticket_claimed,
helpdesk.ticket_resolved) so the audit narrative remains complete.
"""

from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone as tz


class HelpDeskTicketState(models.Model):
    CLAIM_STATUSES = (
        ("open", "Open"),
        ("claimed", "Claimed"),
        ("resolved", "Resolved"),
    )
    RESOLUTION_ACTIONS = (
        ("approve_checkin", "Approve check-in"),
        ("resolved_with_note", "Resolved with note"),
        ("void", "Void"),
    )

    audit_event = models.OneToOneField(
        "audit.AuditEvent",
        on_delete=models.PROTECT,
        related_name="helpdesk_state",
    )
    organization = models.ForeignKey(
        "orgs.Organization", on_delete=models.PROTECT, related_name="+"
    )
    event = models.ForeignKey("events.Event", on_delete=models.PROTECT, related_name="+")
    claim_status = models.CharField(max_length=16, choices=CLAIM_STATUSES, default="open")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    claimed_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_action = models.CharField(
        max_length=24, choices=RESOLUTION_ACTIONS, blank=True
    )
    resolution_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(default=tz.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes: ClassVar = [
            models.Index(fields=("event", "claim_status", "-created_at"), name="hdts_event_status"),
        ]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"Ticket(audit={self.audit_event_id}, status={self.claim_status})"
```

- [ ] **Step 5: Write the admin**

```python
# backend/apps/helpdesk/admin.py
from django.contrib import admin

from apps.helpdesk.models import HelpDeskTicketState


@admin.register(HelpDeskTicketState)
class HelpDeskTicketStateAdmin(admin.ModelAdmin):
    list_display = ("created_at", "claim_status", "organization", "event", "assigned_to")
    list_filter = ("claim_status", "resolution_action")
    readonly_fields = ("audit_event", "organization", "event", "created_at", "updated_at")
```

- [ ] **Step 6: Register the app**

In `backend/config/settings/base.py`, add `"apps.helpdesk"` to `INSTALLED_APPS` right after `"apps.scanner"`:

```python
INSTALLED_APPS = [
    # ... existing ...
    "apps.scanner",
    "apps.helpdesk",
]
```

- [ ] **Step 7: Generate the initial migration**

```bash
cd backend && uv run python manage.py makemigrations helpdesk
# Expect: Migrations for 'helpdesk': 0001_initial.py
```

Verify the generated file at `backend/apps/helpdesk/migrations/0001_initial.py` declares the `HelpDeskTicketState` model with the unique constraint on `audit_event`.

- [ ] **Step 8: Run the model tests**

```bash
cd backend && uv run pytest tests/test_helpdesk_ticket_state_model.py -v
```

Expected: 3 passed.

- [ ] **Step 9: Write the backfill data migration**

```python
# backend/apps/helpdesk/migrations/0002_backfill_existing_escalations.py
"""Backfill HelpDeskTicketState rows for any pre-existing
checkin.help_desk_escalation audit rows (Plan E verification left 2 such
rows on staging; new dev DBs will have zero)."""

from __future__ import annotations

from django.db import migrations


def backfill(apps, schema_editor):
    AuditEvent = apps.get_model("audit", "AuditEvent")
    HelpDeskTicketState = apps.get_model("helpdesk", "HelpDeskTicketState")

    escalations = AuditEvent.objects.filter(action="checkin.help_desk_escalation")
    for audit in escalations.iterator():
        if HelpDeskTicketState.objects.filter(audit_event_id=audit.id).exists():
            continue
        HelpDeskTicketState.objects.create(
            audit_event_id=audit.id,
            organization_id=audit.organization_id,
            event_id=audit.event_id,
            claim_status="open",
        )


def reverse(apps, schema_editor):
    # Don't undelete state on rollback — operators may have resolved tickets.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("helpdesk", "0001_initial"),
        ("audit", "0002_append_only_trigger"),
    ]
    operations = [migrations.RunPython(backfill, reverse)]
```

- [ ] **Step 10: Write the backfill test**

```python
# backend/tests/test_helpdesk_backfill.py
"""Verify the 0002 backfill creates one state row per existing escalation."""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.audit.services import write_audit
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_backfill_creates_state_for_existing_escalations():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Door", slug="door")
    # Two escalations exist before backfill.
    write_audit(
        organization=org, event=event, actor_type="scanner_device", actor_id="d1",
        action="checkin.help_desk_escalation", result="warning",
    )
    write_audit(
        organization=org, event=event, actor_type="scanner_device", actor_id="d2",
        action="checkin.help_desk_escalation", result="warning",
    )
    # One unrelated audit row that should NOT get a state.
    write_audit(
        organization=org, event=event, actor_type="scanner_device", actor_id="d1",
        action="checkin.success", result="success",
    )
    # Wipe any existing state (the migration ran when DB was set up; we
    # want to test the backfill function itself):
    HelpDeskTicketState.objects.all().delete()
    # Re-run the migration's logic by importing the function directly.
    from apps.helpdesk.migrations.v0002_backfill_existing_escalations import backfill as _b
    # (above import will fail — the migration file is named 0002_..., not v0002_...; we just
    # call the function via a local import in the test runner). Adjust the import to:
    import importlib
    mod = importlib.import_module("apps.helpdesk.migrations.0002_backfill_existing_escalations")
    mod.backfill(__import__("django.apps").apps.apps, None)

    assert HelpDeskTicketState.objects.count() == 2
    for state in HelpDeskTicketState.objects.all():
        assert state.claim_status == "open"
        assert state.audit_event.action == "checkin.help_desk_escalation"
```

> **Subagent note:** Python import names beginning with a digit need `importlib` indirection — the test does this. Don't "fix" the file name to start with a letter; Django migration filenames must start with a number.

- [ ] **Step 11: Apply migrations + run the test**

```bash
cd backend && uv run python manage.py migrate helpdesk
# Expect: Applying helpdesk.0001_initial... OK; Applying helpdesk.0002_backfill_existing_escalations... OK

uv run pytest tests/test_helpdesk_backfill.py -v
```

Expected: 1 passed.

- [ ] **Step 12: Full suite check**

```bash
cd backend && uv run pytest -q
```

Expected: 181 passed (was 177; +3 model tests + 1 backfill test).

- [ ] **Step 13: Commit**

```bash
git add backend/apps/helpdesk/ \
        backend/config/settings/base.py \
        backend/tests/test_helpdesk_ticket_state_model.py \
        backend/tests/test_helpdesk_backfill.py
git commit -m "feat(helpdesk): HelpDeskTicketState model + backfill of existing escalations"
```

---

## Task 3 — Extend `POST /api/v1/scanner/escalations/` to create the state row

> The escalation endpoint (Plan E) writes the audit row. Plan F wraps that write in a transaction that also creates the `HelpDeskTicketState(open)` row.

**Files:**
- Modify: `backend/apps/scanner/views.py`
- Modify: `backend/tests/test_scanner_escalation_endpoint.py`

- [ ] **Step 1: Add a failing test**

Append to `backend/tests/test_scanner_escalation_endpoint.py`:

```python
import pytest
from django.urls import reverse

from apps.helpdesk.models import HelpDeskTicketState


@pytest.mark.django_db
def test_escalation_creates_open_ticket_state(client, session):
    org, event, device, raw = session
    url = reverse("scanner-escalation")
    res = client.post(
        url,
        data={"token": "raw-token-y", "reason": "manual"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {raw}",
    )
    assert res.status_code == 201, res.content
    audit_id = res.json()["escalation_id"]
    state = HelpDeskTicketState.objects.get(audit_event_id=audit_id)
    assert state.claim_status == "open"
    assert state.organization_id == org.id
    assert state.event_id == event.id
```

- [ ] **Step 2: Verify the test fails**

```bash
cd backend && uv run pytest tests/test_scanner_escalation_endpoint.py::test_escalation_creates_open_ticket_state -v
```

Expected: FAIL — `HelpDeskTicketState.DoesNotExist`.

- [ ] **Step 3: Wrap the escalation in a transaction + create the state row**

In `backend/apps/scanner/views.py`, modify `EscalationView.post`:

```python
from django.db import transaction
from apps.helpdesk.models import HelpDeskTicketState

class EscalationView(APIView):
    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = (AllowAny,)

    def post(self, request):
        device = getattr(request, "scanner_device", None)
        if not device:
            return Response({"detail": "Session token required."}, status=401)
        token = (request.data.get("token") or "").strip()
        if not token:
            return Response({"detail": "token is required."}, status=400)
        reason = (request.data.get("reason") or "manual").strip()
        original_payload = request.data.get("original_payload") or {}
        conflict_payload = request.data.get("conflict_payload") or {}

        with transaction.atomic():
            audit = write_audit(
                organization=device.organization,
                event=device.event,
                actor_type="scanner_device",
                actor_id=str(device.id),
                action="checkin.help_desk_escalation",
                result="warning",
                entry_token=token[:128],
                details={
                    "reason": reason,
                    "original_payload": original_payload,
                    "conflict_payload": conflict_payload,
                    "device_label": device.label,
                },
            )
            HelpDeskTicketState.objects.create(
                audit_event=audit,
                organization=device.organization,
                event=device.event,
                claim_status="open",
            )
        return Response({"escalation_id": str(audit.id)}, status=201)
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && uv run pytest tests/test_scanner_escalation_endpoint.py -v
```

Expected: all 4 tests pass (3 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/scanner/views.py \
        backend/tests/test_scanner_escalation_endpoint.py
git commit -m "feat(scanner): escalation endpoint creates HelpDeskTicketState alongside audit row"
```

---

## Task 4 — `GET /api/v1/orgs/<slug>/events/<event>/helpdesk/tickets/` list

> Paginated, ETag-aware list endpoint. Returns one row per `HelpDeskTicketState` joined with its `AuditEvent` for the inbox display. Supports the four filter chips: `open`, `claimed`, `resolved`, `all`. Org member auth.

**Files:**
- Create: `backend/apps/helpdesk/views.py`
- Create: `backend/apps/helpdesk/serializers.py`
- Create: `backend/apps/helpdesk/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/tests/test_helpdesk_list_endpoint.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_helpdesk_list_endpoint.py
"""GET /api/v1/orgs/<slug>/events/<event>/helpdesk/tickets/"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.services import write_audit
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event, user


def _make_ticket(org, event, action="checkin.help_desk_escalation", status="open"):
    audit = write_audit(
        organization=org, event=event, actor_type="scanner_device", actor_id="d1",
        action=action, result="warning",
    )
    return HelpDeskTicketState.objects.create(
        audit_event=audit, organization=org, event=event, claim_status=status,
    )


def test_list_returns_open_tickets(env):
    c, org, event, _ = env
    _make_ticket(org, event)
    _make_ticket(org, event)
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    assert r.status_code == 200
    assert len(r.json()["results"]) == 2


def test_list_filter_chip_resolved(env):
    c, org, event, _ = env
    _make_ticket(org, event, status="open")
    _make_ticket(org, event, status="resolved")
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/?status=resolved")
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 1
    assert results[0]["claim_status"] == "resolved"


def test_list_excludes_other_events(env):
    c, org, event, _ = env
    other = Event.objects.create(organization=org, name="Other", slug="other")
    _make_ticket(org, event)
    _make_ticket(org, other)
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    assert len(r.json()["results"]) == 1


def test_list_anonymous_forbidden(env):
    _, org, event, _ = env
    r = APIClient().get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    assert r.status_code in (401, 403)


def test_list_payload_shape(env):
    c, org, event, _ = env
    ticket = _make_ticket(org, event)
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    row = r.json()["results"][0]
    assert row["id"] == str(ticket.id)
    assert "audit_event" in row
    assert row["audit_event"]["action"] == "checkin.help_desk_escalation"
    assert "details_json" in row["audit_event"]
    assert row["claim_status"] == "open"


def test_list_etag_returns_304_on_match(env):
    c, org, event, _ = env
    _make_ticket(org, event)
    r1 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/")
    etag = r1["ETag"]
    r2 = c.get(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/",
        HTTP_IF_NONE_MATCH=etag,
    )
    assert r2.status_code == 304
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && uv run pytest tests/test_helpdesk_list_endpoint.py -v
```

Expected: FAIL — URL not configured.

- [ ] **Step 3: Write the serializer**

```python
# backend/apps/helpdesk/serializers.py
from __future__ import annotations

from rest_framework import serializers

from apps.audit.models import AuditEvent
from apps.helpdesk.models import HelpDeskTicketState


class AuditEventCompactSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "occurred_at",
            "action",
            "result",
            "entry_token",
            "gate",
            "scanner",
            "actor_type",
            "actor_id",
            "details_json",
        )


class HelpDeskTicketStateSerializer(serializers.ModelSerializer):
    audit_event = AuditEventCompactSerializer(read_only=True)
    assigned_to_email = serializers.SerializerMethodField()

    class Meta:
        model = HelpDeskTicketState
        fields = (
            "id",
            "audit_event",
            "claim_status",
            "assigned_to_email",
            "claimed_at",
            "resolved_at",
            "resolution_action",
            "resolution_notes",
            "created_at",
            "updated_at",
        )

    def get_assigned_to_email(self, obj) -> str | None:
        return obj.assigned_to.email if obj.assigned_to_id else None
```

- [ ] **Step 4: Write the view**

```python
# backend/apps/helpdesk/views.py
from __future__ import annotations

import hashlib

from django.db.models import Max
from django.http import HttpResponseNotModified
from django.shortcuts import get_object_or_404
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsOrgMember
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.helpdesk.serializers import HelpDeskTicketStateSerializer


class _Pagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class HelpDeskTicketListView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        qs = HelpDeskTicketState.objects.filter(event=event).select_related(
            "audit_event", "assigned_to"
        )

        status_filter = request.query_params.get("status")
        if status_filter in {"open", "claimed", "resolved"}:
            qs = qs.filter(claim_status=status_filter)
        elif status_filter == "open_or_claimed":
            qs = qs.filter(claim_status__in=("open", "claimed"))

        agg = qs.aggregate(latest=Max("updated_at"), maxid=Max("id"))
        raw = f"{agg.get('latest')}-{agg.get('maxid')}-{status_filter or 'all'}"
        etag = f'W/"{hashlib.sha256(raw.encode()).hexdigest()[:16]}"'

        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            return HttpResponseNotModified()

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs.order_by("-created_at"), request, view=self)
        ser = HelpDeskTicketStateSerializer(page, many=True)
        resp = paginator.get_paginated_response(ser.data)
        resp["ETag"] = etag
        return resp
```

- [ ] **Step 5: Write the URL config**

```python
# backend/apps/helpdesk/urls.py
from django.urls import path

from apps.helpdesk.views import HelpDeskTicketListView

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/helpdesk/tickets/",
        HelpDeskTicketListView.as_view(),
        name="helpdesk-ticket-list",
    ),
]
```

- [ ] **Step 6: Wire into root URLs**

In `backend/config/urls.py`, add the include after the existing `apps.scanner` line:

```python
urlpatterns = [
    # ... existing ...
    path("api/v1/", include("apps.scanner.urls")),
    path("api/v1/", include("apps.helpdesk.urls")),
]
```

- [ ] **Step 7: Run the tests**

```bash
cd backend && uv run pytest tests/test_helpdesk_list_endpoint.py -v
```

Expected: 6 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/helpdesk/views.py \
        backend/apps/helpdesk/serializers.py \
        backend/apps/helpdesk/urls.py \
        backend/config/urls.py \
        backend/tests/test_helpdesk_list_endpoint.py
git commit -m "feat(helpdesk): GET /helpdesk/tickets/ list endpoint with status filter + ETag"
```

---

## Task 5 — Claim / release / resolve endpoints + audit emission

> Three POST endpoints to drive ticket state. Each emits a `helpdesk.*` audit row so the audit log narrates state changes too.

**Files:**
- Modify: `backend/apps/helpdesk/views.py`
- Modify: `backend/apps/helpdesk/urls.py`
- Create: `backend/apps/helpdesk/services.py`
- Test: `backend/tests/test_helpdesk_actions.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_helpdesk_actions.py
"""POST claim / release / resolve endpoints for help-desk tickets."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.audit.services import write_audit
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    audit = write_audit(
        organization=org, event=event, actor_type="scanner_device", actor_id="d1",
        action="checkin.help_desk_escalation", result="warning",
    )
    ticket = HelpDeskTicketState.objects.create(
        audit_event=audit, organization=org, event=event, claim_status="open",
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event, user, ticket


def test_claim_sets_status_and_assignee(env):
    c, org, event, user, ticket = env
    r = c.post(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/claim/")
    assert r.status_code == 200
    ticket.refresh_from_db()
    assert ticket.claim_status == "claimed"
    assert ticket.assigned_to_id == user.id
    assert AuditEvent.objects.filter(action="helpdesk.ticket_claimed").count() == 1


def test_release_returns_to_open_and_clears_assignee(env):
    c, org, event, user, ticket = env
    ticket.claim_status = "claimed"
    ticket.assigned_to = user
    ticket.save()
    r = c.post(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/release/")
    assert r.status_code == 200
    ticket.refresh_from_db()
    assert ticket.claim_status == "open"
    assert ticket.assigned_to_id is None


def test_resolve_with_action_and_notes(env):
    c, org, event, user, ticket = env
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/resolve/",
        data={"action": "approve_checkin", "notes": "Verified ID."},
        format="json",
    )
    assert r.status_code == 200
    ticket.refresh_from_db()
    assert ticket.claim_status == "resolved"
    assert ticket.resolution_action == "approve_checkin"
    assert ticket.resolution_notes == "Verified ID."
    assert ticket.resolved_at is not None
    audit = AuditEvent.objects.filter(action="helpdesk.ticket_resolved").first()
    assert audit is not None
    assert audit.details_json["action"] == "approve_checkin"


def test_resolve_rejects_unknown_action(env):
    c, org, event, _, ticket = env
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/resolve/",
        data={"action": "delete_audit_history", "notes": ""},
        format="json",
    )
    assert r.status_code == 400


def test_actions_require_org_membership(env):
    _, org, event, _, ticket = env
    other = APIClient()
    r = other.post(f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/tickets/{ticket.id}/claim/")
    assert r.status_code in (401, 403, 404)
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && uv run pytest tests/test_helpdesk_actions.py -v
```

Expected: FAIL — URLs don't exist.

- [ ] **Step 3: Write the service helpers**

```python
# backend/apps/helpdesk/services.py
"""Mutations on HelpDeskTicketState. Each mutation also emits an audit row
so the audit log narrates state transitions."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.audit.services import write_audit
from apps.helpdesk.models import HelpDeskTicketState

VALID_RESOLUTIONS = {"approve_checkin", "resolved_with_note", "void"}


@transaction.atomic
def claim_ticket(*, ticket: HelpDeskTicketState, user) -> HelpDeskTicketState:
    ticket.claim_status = "claimed"
    ticket.assigned_to = user
    ticket.claimed_at = timezone.now()
    ticket.save(update_fields=["claim_status", "assigned_to", "claimed_at", "updated_at"])
    write_audit(
        organization=ticket.organization,
        event=ticket.event,
        actor_type="user",
        actor_id=str(user.id),
        action="helpdesk.ticket_claimed",
        result="success",
        details={"ticket_id": ticket.id, "audit_event_id": str(ticket.audit_event_id)},
    )
    return ticket


@transaction.atomic
def release_ticket(*, ticket: HelpDeskTicketState, user) -> HelpDeskTicketState:
    ticket.claim_status = "open"
    ticket.assigned_to = None
    ticket.claimed_at = None
    ticket.save(update_fields=["claim_status", "assigned_to", "claimed_at", "updated_at"])
    write_audit(
        organization=ticket.organization,
        event=ticket.event,
        actor_type="user",
        actor_id=str(user.id),
        action="helpdesk.ticket_released",
        result="success",
        details={"ticket_id": ticket.id, "audit_event_id": str(ticket.audit_event_id)},
    )
    return ticket


@transaction.atomic
def resolve_ticket(
    *, ticket: HelpDeskTicketState, user, action: str, notes: str
) -> HelpDeskTicketState:
    if action not in VALID_RESOLUTIONS:
        raise ValueError(f"Unknown resolution action: {action}")
    ticket.claim_status = "resolved"
    ticket.resolution_action = action
    ticket.resolution_notes = notes
    ticket.resolved_at = timezone.now()
    if not ticket.assigned_to_id:
        ticket.assigned_to = user
        ticket.claimed_at = ticket.claimed_at or timezone.now()
    ticket.save()
    write_audit(
        organization=ticket.organization,
        event=ticket.event,
        actor_type="user",
        actor_id=str(user.id),
        action="helpdesk.ticket_resolved",
        result="success",
        details={
            "ticket_id": ticket.id,
            "audit_event_id": str(ticket.audit_event_id),
            "action": action,
            "notes": notes,
        },
    )
    return ticket
```

- [ ] **Step 4: Add the action views**

Append to `backend/apps/helpdesk/views.py`:

```python
from rest_framework.exceptions import ValidationError

from apps.helpdesk.services import claim_ticket, release_ticket, resolve_ticket


class _TicketActionMixin:
    permission_classes = (IsAuthenticated, IsOrgMember)

    def _ticket(self, request, event_slug, ticket_id) -> HelpDeskTicketState:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        return get_object_or_404(HelpDeskTicketState, id=ticket_id, event=event)


class HelpDeskTicketClaimView(_TicketActionMixin, APIView):
    def post(self, request, org_slug, event_slug, ticket_id):
        ticket = self._ticket(request, event_slug, ticket_id)
        ticket = claim_ticket(ticket=ticket, user=request.user)
        return Response(HelpDeskTicketStateSerializer(ticket).data)


class HelpDeskTicketReleaseView(_TicketActionMixin, APIView):
    def post(self, request, org_slug, event_slug, ticket_id):
        ticket = self._ticket(request, event_slug, ticket_id)
        ticket = release_ticket(ticket=ticket, user=request.user)
        return Response(HelpDeskTicketStateSerializer(ticket).data)


class HelpDeskTicketResolveView(_TicketActionMixin, APIView):
    def post(self, request, org_slug, event_slug, ticket_id):
        ticket = self._ticket(request, event_slug, ticket_id)
        action = (request.data.get("action") or "").strip()
        notes = (request.data.get("notes") or "").strip()
        try:
            ticket = resolve_ticket(ticket=ticket, user=request.user, action=action, notes=notes)
        except ValueError as exc:
            raise ValidationError({"action": str(exc)}) from exc
        return Response(HelpDeskTicketStateSerializer(ticket).data)
```

- [ ] **Step 5: Add the URL routes**

In `backend/apps/helpdesk/urls.py`:

```python
from django.urls import path

from apps.helpdesk.views import (
    HelpDeskTicketClaimView,
    HelpDeskTicketListView,
    HelpDeskTicketReleaseView,
    HelpDeskTicketResolveView,
)

PREFIX = "orgs/<slug:org_slug>/events/<slug:event_slug>/helpdesk/tickets"

urlpatterns = [
    path(f"{PREFIX}/", HelpDeskTicketListView.as_view(), name="helpdesk-ticket-list"),
    path(f"{PREFIX}/<int:ticket_id>/claim/", HelpDeskTicketClaimView.as_view(), name="helpdesk-claim"),
    path(f"{PREFIX}/<int:ticket_id>/release/", HelpDeskTicketReleaseView.as_view(), name="helpdesk-release"),
    path(f"{PREFIX}/<int:ticket_id>/resolve/", HelpDeskTicketResolveView.as_view(), name="helpdesk-resolve"),
]
```

- [ ] **Step 6: Run the tests**

```bash
cd backend && uv run pytest tests/test_helpdesk_actions.py -v
```

Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/helpdesk/services.py \
        backend/apps/helpdesk/views.py \
        backend/apps/helpdesk/urls.py \
        backend/tests/test_helpdesk_actions.py
git commit -m "feat(helpdesk): claim/release/resolve endpoints + audit emission"
```

---

## Task 6 — `GET /api/v1/orgs/<slug>/events/<event>/audit/` audit list

> Read-only audit-event list scoped to one event, with action-prefix filter (`action_prefix=checkin.` returns all checkin audit rows). ETag-aware. Pagination.

**Files:**
- Create: `backend/apps/audit/views.py`
- Create: `backend/apps/audit/serializers.py`
- Create: `backend/apps/audit/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/tests/test_audit_list_endpoint.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_audit_list_endpoint.py
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.services import write_audit
from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event


def test_list_returns_event_scoped_audits(env):
    c, org, event = env
    write_audit(organization=org, event=event, actor_type="system", actor_id="s",
                action="checkin.success", result="success")
    write_audit(organization=org, event=event, actor_type="system", actor_id="s",
                action="checkin.duplicate", result="warning")
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/")
    assert r.status_code == 200
    assert len(r.json()["results"]) == 2


def test_list_filter_by_action_prefix(env):
    c, org, event = env
    write_audit(organization=org, event=event, actor_type="system", actor_id="s",
                action="checkin.success", result="success")
    write_audit(organization=org, event=event, actor_type="system", actor_id="s",
                action="walkin.claim", result="success")
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/?action_prefix=checkin.")
    results = r.json()["results"]
    assert len(results) == 1
    assert results[0]["action"] == "checkin.success"


def test_list_excludes_other_events(env):
    c, org, event = env
    other = Event.objects.create(organization=org, name="Other", slug="other")
    write_audit(organization=org, event=event, actor_type="system", actor_id="s",
                action="checkin.success", result="success")
    write_audit(organization=org, event=other, actor_type="system", actor_id="s",
                action="checkin.success", result="success")
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/")
    assert len(r.json()["results"]) == 1


def test_list_anonymous_forbidden(env):
    _, org, event = env
    r = APIClient().get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/")
    assert r.status_code in (401, 403)


def test_list_etag(env):
    c, org, event = env
    write_audit(organization=org, event=event, actor_type="system", actor_id="s",
                action="checkin.success", result="success")
    r1 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/")
    etag = r1["ETag"]
    r2 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/audit/", HTTP_IF_NONE_MATCH=etag)
    assert r2.status_code == 304
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && uv run pytest tests/test_audit_list_endpoint.py -v
```

Expected: FAIL — URL not configured.

- [ ] **Step 3: Write the serializer**

```python
# backend/apps/audit/serializers.py
from __future__ import annotations

from rest_framework import serializers

from apps.audit.models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = (
            "id", "occurred_at", "actor_type", "actor_id", "action", "result",
            "previous_status", "new_status", "gate", "scanner", "entry_token",
            "details_json",
        )
        read_only_fields = fields
```

- [ ] **Step 4: Write the view**

```python
# backend/apps/audit/views.py
from __future__ import annotations

import hashlib

from django.db.models import Max
from django.http import HttpResponseNotModified
from django.shortcuts import get_object_or_404
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditEvent
from apps.audit.serializers import AuditEventSerializer
from apps.common.permissions import IsOrgMember
from apps.events.models import Event


class _Pagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500


class AuditListView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        qs = AuditEvent.objects.filter(event=event)

        action_prefix = request.query_params.get("action_prefix")
        if action_prefix:
            qs = qs.filter(action__startswith=action_prefix)

        agg = qs.aggregate(latest=Max("occurred_at"), maxid=Max("id"))
        raw = f"{agg.get('latest')}-{agg.get('maxid')}-{action_prefix or 'all'}"
        etag = f'W/"{hashlib.sha256(raw.encode()).hexdigest()[:16]}"'
        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            return HttpResponseNotModified()

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs.order_by("-occurred_at"), request, view=self)
        ser = AuditEventSerializer(page, many=True)
        resp = paginator.get_paginated_response(ser.data)
        resp["ETag"] = etag
        return resp
```

- [ ] **Step 5: Write the URL config**

```python
# backend/apps/audit/urls.py
from django.urls import path

from apps.audit.views import AuditListView

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/audit/",
        AuditListView.as_view(),
        name="audit-list",
    ),
]
```

- [ ] **Step 6: Wire into root URLs**

In `backend/config/urls.py`, add right after the helpdesk include:

```python
path("api/v1/", include("apps.audit.urls")),
```

- [ ] **Step 7: Run the tests**

```bash
cd backend && uv run pytest tests/test_audit_list_endpoint.py -v
```

Expected: 5 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/audit/views.py \
        backend/apps/audit/serializers.py \
        backend/apps/audit/urls.py \
        backend/config/urls.py \
        backend/tests/test_audit_list_endpoint.py
git commit -m "feat(audit): GET /audit/ list endpoint with action_prefix filter + ETag"
```

---

## Task 7 — `GET /api/v1/orgs/<slug>/events/<event>/stats/` counts endpoint

> One endpoint, one ETag, one JSON payload of counts the dashboard widget will poll every 5s:
>
> ```json
> {
>   "checked_in": 142, "registered_not_arrived": 313, "manual_review": 4,
>   "displayed": 12, "total_walkins": 18, "open_escalations": 1,
>   "conflicts_recent_15min": 0, "as_of": "2026-05-21T08:22:14Z"
> }
> ```
>
> `displayed` counts guests in `entry_status="displayed"` (a walk-in QR currently shown but not yet checked in). `total_walkins` counts everyone with `guest_type="walk_in"` regardless of entry_status — useful as a top-line walk-in volume metric.

**Files:**
- Create: `backend/apps/events/views_stats.py`
- Modify: `backend/apps/events/urls.py`
- Test: `backend/tests/test_event_stats_endpoint.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_event_stats_endpoint.py
from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.services import write_audit
from apps.events.models import Event
from apps.guests.models import Guest
from apps.helpdesk.models import HelpDeskTicketState
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event


def test_stats_basic_counts(env):
    c, org, event = env
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         full_name="A", entry_status="checked_in")
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         full_name="B", entry_status="registered_not_arrived")
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         full_name="C", entry_status="manual_review")
    Guest.objects.create(organization=org, event=event, guest_type="walk_in",
                         full_name="D", entry_status="displayed")
    Guest.objects.create(organization=org, event=event, guest_type="walk_in",
                         full_name="E", entry_status="checked_in")
    audit = write_audit(
        organization=org, event=event, actor_type="scanner_device", actor_id="d",
        action="checkin.help_desk_escalation", result="warning",
    )
    HelpDeskTicketState.objects.create(
        audit_event=audit, organization=org, event=event, claim_status="open",
    )
    write_audit(organization=org, event=event, actor_type="system", actor_id="s",
                action="checkin.conflict", result="warning")

    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/")
    assert r.status_code == 200
    body = r.json()
    assert body["checked_in"] == 2  # one pre-reg + one walk-in
    assert body["registered_not_arrived"] == 1
    assert body["manual_review"] == 1
    assert body["displayed"] == 1
    assert body["total_walkins"] == 2
    assert body["open_escalations"] == 1
    assert body["conflicts_recent_15min"] == 1


def test_stats_recent_conflict_counted(env):
    c, org, event = env
    write_audit(organization=org, event=event, actor_type="system", actor_id="s",
                action="checkin.conflict", result="warning")
    # A fresh conflict (just written) is within the 15-minute window.
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/")
    assert r.json()["conflicts_recent_15min"] == 1


def test_stats_etag_304(env):
    c, org, event = env
    Guest.objects.create(organization=org, event=event, full_name="A", entry_status="checked_in")
    r1 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/")
    etag = r1["ETag"]
    r2 = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/", HTTP_IF_NONE_MATCH=etag)
    assert r2.status_code == 304


def test_stats_anonymous_forbidden(env):
    _, org, event = env
    r = APIClient().get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/stats/")
    assert r.status_code in (401, 403)
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && uv run pytest tests/test_event_stats_endpoint.py -v
```

Expected: FAIL — URL not wired.

- [ ] **Step 3: Implement the view**

```python
# backend/apps/events/views_stats.py
"""GET /api/v1/orgs/<slug>/events/<event>/stats/ — counters widget.

Cheap aggregates served behind a 5s ETag/304 poll. The ETag is derived from
the latest mutating timestamp across (guests, audit events, ticket states) so
the dashboard returns 304 when nothing has changed since the last poll.
"""

from __future__ import annotations

import hashlib
from datetime import timedelta

from django.db.models import Count, Max
from django.http import HttpResponseNotModified
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditEvent
from apps.common.permissions import IsOrgMember
from apps.events.models import Event
from apps.guests.models import Guest
from apps.helpdesk.models import HelpDeskTicketState


class EventStatsView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)

        # Guest counts: one query, group by entry_status.
        status_counts = (
            Guest.objects.filter(event=event)
            .values("entry_status")
            .annotate(n=Count("id"))
        )
        bucket = {row["entry_status"]: row["n"] for row in status_counts}

        total_walkins = Guest.objects.filter(event=event, guest_type="walk_in").count()

        open_escalations = HelpDeskTicketState.objects.filter(
            event=event, claim_status__in=("open", "claimed")
        ).count()

        cutoff = timezone.now() - timedelta(minutes=15)
        conflicts_recent = AuditEvent.objects.filter(
            event=event, action="checkin.conflict", occurred_at__gte=cutoff
        ).count()

        # ETag inputs:
        guest_agg = Guest.objects.filter(event=event).aggregate(latest=Max("updated_at"))
        ticket_agg = HelpDeskTicketState.objects.filter(event=event).aggregate(latest=Max("updated_at"))
        audit_agg = AuditEvent.objects.filter(event=event).aggregate(latest=Max("occurred_at"))
        raw = f"{guest_agg['latest']}-{ticket_agg['latest']}-{audit_agg['latest']}"
        etag = f'W/"{hashlib.sha256(raw.encode()).hexdigest()[:16]}"'
        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            return HttpResponseNotModified()

        body = {
            "checked_in": bucket.get("checked_in", 0),
            "registered_not_arrived": bucket.get("registered_not_arrived", 0),
            "manual_review": bucket.get("manual_review", 0),
            "displayed": bucket.get("displayed", 0),
            "total_walkins": total_walkins,
            "open_escalations": open_escalations,
            "conflicts_recent_15min": conflicts_recent,
            "as_of": timezone.now().isoformat(),
        }
        resp = Response(body)
        resp["ETag"] = etag
        return resp
```

- [ ] **Step 4: Add the URL route**

In `backend/apps/events/urls.py`, add to the imports and urlpatterns:

```python
from apps.events.views_stats import EventStatsView

urlpatterns = [
    # ... existing ...
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/stats/",
        EventStatsView.as_view(),
        name="event-stats",
    ),
]
```

- [ ] **Step 5: Run tests**

```bash
cd backend && uv run pytest tests/test_event_stats_endpoint.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Run full backend suite**

```bash
cd backend && uv run pytest -q && uv run mypy apps/
```

Expected: 199+ tests pass, mypy clean.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/events/views_stats.py \
        backend/apps/events/urls.py \
        backend/tests/test_event_stats_endpoint.py
git commit -m "feat(events): GET /stats/ counters endpoint with ETag (5s polling target)"
```

---

## Task 8 — Help-desk inbox UI

> The page that consumes Tasks 3-5. Filter chips (`All open`, `Escalations`, `Manual review`, `Resolved`), ticket list on the left (40% width), detail pane on the right with claim/release/resolve actions. Polls the list endpoint every 5s.
>
> **Manual-review tab** queries a separate endpoint (`/api/v1/orgs/<slug>/events/<event>/guests/?entry_status=manual_review`) so we don't conflate audit-row tickets with guest rows in the data model. The unified UX is at the chip level, not the API level.

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/page.tsx`
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/_components/ticket-list.tsx`
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/_components/ticket-detail.tsx`
- Create: `frontend/lib/helpdesk.ts`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` (add "Help desk" link)

- [ ] **Step 1: Add the API client module**

```ts
// frontend/lib/helpdesk.ts
"use client";

import useSWR from "swr";

export type AuditEventCompact = {
  id: string;
  occurred_at: string;
  action: string;
  result: string;
  entry_token: string;
  gate: string;
  scanner: string;
  actor_type: string;
  actor_id: string;
  details_json: Record<string, unknown>;
};

export type Ticket = {
  id: number;
  audit_event: AuditEventCompact;
  claim_status: "open" | "claimed" | "resolved";
  assigned_to_email: string | null;
  claimed_at: string | null;
  resolved_at: string | null;
  resolution_action: "" | "approve_checkin" | "resolved_with_note" | "void";
  resolution_notes: string;
  created_at: string;
  updated_at: string;
};

type ListResponse = { results: Ticket[]; count: number };

const json = async (url: string): Promise<ListResponse> => {
  const r = await fetch(url, { credentials: "include" });
  if (r.status === 304) {
    throw new Error("not-modified"); // SWR handles via revalidation
  }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return (await r.json()) as ListResponse;
};

export function useTickets(orgSlug: string, eventSlug: string, status: string) {
  const qs = status === "all" ? "" : `?status=${status}`;
  return useSWR<ListResponse>(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/${qs}`,
    json,
    { refreshInterval: 5000, revalidateOnFocus: true },
  );
}

export async function claimTicket(orgSlug: string, eventSlug: string, id: number): Promise<Ticket> {
  const r = await fetch(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/${id}/claim/`,
    { method: "POST", credentials: "include" },
  );
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as Ticket;
}

export async function releaseTicket(orgSlug: string, eventSlug: string, id: number): Promise<Ticket> {
  const r = await fetch(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/${id}/release/`,
    { method: "POST", credentials: "include" },
  );
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as Ticket;
}

export async function resolveTicket(
  orgSlug: string,
  eventSlug: string,
  id: number,
  body: { action: "approve_checkin" | "resolved_with_note" | "void"; notes: string },
): Promise<Ticket> {
  const r = await fetch(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/tickets/${id}/resolve/`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as Ticket;
}
```

- [ ] **Step 2: Build the ticket list component**

```tsx
// frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/_components/ticket-list.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { type Ticket } from "@/lib/helpdesk";

type Props = {
  tickets: Ticket[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function TicketList({ tickets, selectedId, onSelect }: Props) {
  if (tickets.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No tickets match this filter.
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="space-y-2">
      {tickets.map((t) => {
        const reason = (t.audit_event.details_json?.reason as string) || t.audit_event.action;
        const isSelected = t.id === selectedId;
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              className={`w-full text-left rounded-md border p-3 hover:bg-accent ${
                isSelected ? "border-primary bg-accent" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant={t.claim_status === "open" ? "destructive" : "secondary"}>
                  {t.claim_status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(t.audit_event.occurred_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium">{reason}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                {t.audit_event.entry_token.slice(0, 16)}…
              </div>
              {t.assigned_to_email ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Claimed by {t.assigned_to_email}
                </div>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Build the detail pane component**

```tsx
// frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/_components/ticket-detail.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  type Ticket,
  claimTicket,
  releaseTicket,
  resolveTicket,
} from "@/lib/helpdesk";

type Props = {
  ticket: Ticket;
  orgSlug: string;
  eventSlug: string;
  onChanged: () => void;
};

export function TicketDetail({ ticket, orgSlug, eventSlug, onChanged }: Props) {
  const [notes, setNotes] = useState(ticket.resolution_notes);
  const [busy, setBusy] = useState(false);

  const wrap = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const claim = wrap(() => claimTicket(orgSlug, eventSlug, ticket.id));
  const release = wrap(() => releaseTicket(orgSlug, eventSlug, ticket.id));
  const resolve = (action: "approve_checkin" | "resolved_with_note" | "void") =>
    wrap(() => resolveTicket(orgSlug, eventSlug, ticket.id, { action, notes }));

  const original = ticket.audit_event.details_json as {
    reason?: string;
    original_payload?: { gate?: string; scanner_label?: string };
    conflict_payload?: { gate?: string; scanner?: string };
    device_label?: string;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {original.reason || ticket.audit_event.action}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <div>
            <span className="text-muted-foreground">Token: </span>
            <span className="font-mono text-xs">{ticket.audit_event.entry_token}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Scanner: </span>
            {original.device_label ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Original: </span>
            {original.original_payload?.gate} / {original.original_payload?.scanner_label}
          </div>
          {original.conflict_payload ? (
            <div>
              <span className="text-muted-foreground">Server says: </span>
              {original.conflict_payload.gate} / {original.conflict_payload.scanner}
            </div>
          ) : null}
        </div>

        {ticket.claim_status !== "resolved" ? (
          <>
            <div className="flex gap-2">
              {ticket.claim_status === "open" ? (
                <Button onClick={claim} disabled={busy}>Claim</Button>
              ) : (
                <Button onClick={release} disabled={busy} variant="outline">Release</Button>
              )}
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Resolution notes (optional)"
              rows={3}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={resolve("approve_checkin")} disabled={busy} variant="default">
                Approve check-in
              </Button>
              <Button onClick={resolve("resolved_with_note")} disabled={busy} variant="secondary">
                Mark resolved (note)
              </Button>
              <Button onClick={resolve("void")} disabled={busy} variant="destructive">
                Mark void
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="font-medium">Resolved · {ticket.resolution_action}</div>
            {ticket.resolution_notes ? (
              <div className="mt-1 text-muted-foreground">{ticket.resolution_notes}</div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Build the page**

```tsx
// frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTickets } from "@/lib/helpdesk";

import { TicketDetail } from "./_components/ticket-detail";
import { TicketList } from "./_components/ticket-list";

type Filter = "open" | "claimed" | "resolved" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "claimed", label: "Claimed" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export default function HelpDeskPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, mutate, isLoading } = useTickets(slug, eventSlug, filter);

  const tickets = data?.results ?? [];
  const selected = tickets.find((t) => t.id === selectedId) ?? tickets[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Help desk</h1>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[40%_1fr]">
        <div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <TicketList
              tickets={tickets}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
          )}
        </div>
        <div>
          {selected ? (
            <TicketDetail
              ticket={selected}
              orgSlug={slug}
              eventSlug={eventSlug}
              onChanged={() => void mutate()}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a ticket.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the link from the event-detail page**

In `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`, add a "Help desk" link button to the existing button row (next to Devices/Form/Guests/Settings):

```tsx
<Link
  href={`/orgs/${slug}/events/${eventSlug}/helpdesk`}
  className={buttonVariants({ variant: "outline" })}
>
  Help desk
</Link>
```

- [ ] **Step 6: Smoke test locally**

```bash
cd backend && uv run python manage.py runserver &
cd frontend && pnpm dev
# Open http://localhost:3000/orgs/<slug>/events/<eventSlug>/helpdesk
```

Manual checks (door-day rehearsal):
- Page renders with the 4 filter chips
- "Open" tab lists the 2 escalations from the Plan E verification (if testing against staging-imported data)
- Click a ticket → detail pane shows reason, token, original payload
- Click "Claim" → ticket moves to "Claimed" filter; assignee email shows
- Click "Mark resolved (note)" with text → moves to "Resolved"; audit row appears in DB

- [ ] **Step 7: Commit**

```bash
git add frontend/app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/helpdesk/ \
        frontend/lib/helpdesk.ts \
        frontend/app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/page.tsx
git commit -m "feat(helpdesk): /orgs/<slug>/events/<event>/helpdesk inbox UI with claim/resolve flow"
```

---

## Task 9 — Audit viewer UI

> Read-only paged table of `AuditEvent` rows for one event. Filter dropdown over the action prefix (`all`, `checkin.`, `walkin.`, `helpdesk.`). Auto-refreshes every 10s via SWR.

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx`
- Create: `frontend/lib/audit.ts`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` (add "Audit" link)

- [ ] **Step 1: Add the API client module**

```ts
// frontend/lib/audit.ts
"use client";

import useSWR from "swr";

export type AuditRow = {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_id: string;
  action: string;
  result: "success" | "warning" | "error";
  previous_status: string;
  new_status: string;
  gate: string;
  scanner: string;
  entry_token: string;
  details_json: Record<string, unknown>;
};

type ListResponse = { results: AuditRow[]; count: number; next: string | null };

const fetcher = async (url: string): Promise<ListResponse> => {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as ListResponse;
};

export function useAuditEvents(orgSlug: string, eventSlug: string, prefix: string) {
  const qs = prefix === "all" ? "" : `?action_prefix=${prefix}`;
  return useSWR<ListResponse>(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/audit/${qs}`,
    fetcher,
    { refreshInterval: 10_000 },
  );
}
```

- [ ] **Step 2: Build the page**

```tsx
// frontend/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuditEvents } from "@/lib/audit";

const PREFIXES = [
  { value: "all", label: "All" },
  { value: "checkin.", label: "Check-ins" },
  { value: "walkin.", label: "Walk-ins" },
  { value: "helpdesk.", label: "Help desk" },
];

function resultColor(result: string): "default" | "secondary" | "destructive" {
  if (result === "success") return "default";
  if (result === "warning") return "secondary";
  return "destructive";
}

export default function AuditPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const [prefix, setPrefix] = useState("all");
  const { data, isLoading } = useAuditEvents(slug, eventSlug, prefix);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <div className="flex gap-1">
          {PREFIXES.map((p) => (
            <Button
              key={p.value}
              variant={prefix === p.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPrefix(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading ? "Loading…" : `${data?.count ?? 0} rows`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
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
            <tbody>
              {(data?.results ?? []).map((row) => (
                <tr key={row.id} className="border-b text-xs">
                  <td className="py-2 pr-3 font-mono">
                    {new Date(row.occurred_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 font-mono">{row.action}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={resultColor(row.result)}>{row.result}</Badge>
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {row.actor_type}:{row.actor_id.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-3 font-mono">{row.entry_token.slice(0, 16)}</td>
                  <td className="py-2 font-mono">
                    {row.previous_status} → {row.new_status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add the link from the event-detail page**

In `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`, add next to "Help desk":

```tsx
<Link
  href={`/orgs/${slug}/events/${eventSlug}/audit`}
  className={buttonVariants({ variant: "outline" })}
>
  Audit
</Link>
```

- [ ] **Step 4: Smoke test**

Navigate to `/orgs/<slug>/events/<eventSlug>/audit`. Confirm rows render; filter chips swap the action prefix; auto-refresh ticks every 10s (visible via the "X rows" count incrementing if you take a check-in mid-view).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/audit.ts \
        frontend/app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/audit/ \
        frontend/app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/page.tsx
git commit -m "feat(audit): /orgs/<slug>/events/<event>/audit viewer page"
```

---

## Task 10 — Dashboard polling counts widget

> Add a 6-tile counts widget to the existing event-detail page. Polls `/stats/` every 5s. Tiles: Checked-in, Pending, Manual review, Walk-in registered, Open escalations, Conflicts (15 min).

**Files:**
- Create: `frontend/lib/event-stats.ts`
- Create: `frontend/components/events/stats-widget.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`

- [ ] **Step 1: Add the SWR hook**

```ts
// frontend/lib/event-stats.ts
"use client";

import useSWR from "swr";

export type EventStats = {
  checked_in: number;
  registered_not_arrived: number;
  manual_review: number;
  displayed: number;
  total_walkins: number;
  open_escalations: number;
  conflicts_recent_15min: number;
  as_of: string;
};

const fetcher = async (url: string): Promise<EventStats> => {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as EventStats;
};

export function useEventStats(orgSlug: string, eventSlug: string) {
  return useSWR<EventStats>(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/stats/`,
    fetcher,
    { refreshInterval: 5_000, revalidateOnFocus: true },
  );
}
```

- [ ] **Step 2: Build the widget component**

```tsx
// frontend/components/events/stats-widget.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useEventStats } from "@/lib/event-stats";

type Tile = { label: string; value: number; tone: "default" | "warning" | "danger" };

export function StatsWidget({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const { data, isLoading } = useEventStats(orgSlug, eventSlug);

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading counts…</p>;
  }

  const tiles: Tile[] = [
    { label: "Checked in", value: data.checked_in, tone: "default" },
    { label: "Pending", value: data.registered_not_arrived, tone: "default" },
    { label: "Walk-in QR shown", value: data.displayed, tone: "default" },
    { label: "Manual review", value: data.manual_review, tone: data.manual_review > 0 ? "warning" : "default" },
    { label: "Open escalations", value: data.open_escalations, tone: data.open_escalations > 0 ? "warning" : "default" },
    { label: "Conflicts (15m)", value: data.conflicts_recent_15min, tone: data.conflicts_recent_15min > 0 ? "danger" : "default" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="py-4">
            <div className={`text-2xl font-semibold tabular-nums ${
              t.tone === "warning" ? "text-amber-600 dark:text-amber-400" :
              t.tone === "danger" ? "text-red-600 dark:text-red-400" : ""
            }`}>
              {t.value}
            </div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Render the widget on the event-detail page**

In `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`, import and render between the title row and the public-registration card:

```tsx
import { StatsWidget } from "@/components/events/stats-widget";

// In the return, after the header div:
<StatsWidget orgSlug={slug} eventSlug={eventSlug} />
```

- [ ] **Step 4: Smoke test**

Open the event-detail page on staging or local. Observe:
- All 6 tiles render with non-NaN values
- Triggering a scan (or scripted check-in) bumps "Checked in" within ≤6s
- Generating an escalation bumps "Open escalations" within ≤6s
- DevTools Network shows `/stats/` requests every 5s, mostly returning 304

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/event-stats.ts \
        frontend/components/events/stats-widget.tsx \
        frontend/app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/page.tsx
git commit -m "feat(events): live counts widget on event detail page (5s polling)"
```

---

## Task 11 — Manual-review chip + transition endpoints

> Completes the locked unified-queue design by adding a "Manual review" chip to the Task 8 inbox. The chip queries guests with `entry_status="manual_review"` and renders them with two resolve actions: **Approve check-in** (transition to `checked_in`) and **Mark void** (transition to `voided`).
>
> Backend deliverables:
> - Extend `apps.guests.transitions._ENTRY_TABLE` to permit `manual_review → checked_in` and `manual_review → voided` for both `pre_registered` and `walk_in` guests. Per brief Appendix A row 8, this is "help-desk override authority" — staff role suffices.
> - Add `?entry_status=manual_review` filter to `GuestListView` (3-line change).
> - Add new endpoint `POST /api/v1/orgs/<slug>/events/<event>/helpdesk/manual-review/<guest_id>/resolve/` that takes `{"action": "approve_checkin" | "void", "notes": "..."}`, applies the transition, and writes a `helpdesk.manual_review_resolved` audit row.
>
> Frontend deliverables:
> - Extend the Task 8 page chip set: `Open` / `Claimed` / `Resolved` / `Manual review` / `All`.
> - Introduce a unified `InboxItem` discriminated-union type: `{type: "ticket", ticket: Ticket}` or `{type: "manual_review", guest: ManualReviewGuest}`.
> - When the chip is "Manual review", fetch from the guests endpoint and map to `InboxItem[]`. Other chips fetch from tickets.
> - Detail pane variant for manual-review items: shows guest name + email + phone, with "Approve check-in" / "Mark void" buttons.

**Files:**
- Modify: `backend/apps/guests/transitions.py`
- Modify: `backend/apps/guests/views.py` (GuestListView entry_status filter)
- Create: `backend/apps/helpdesk/views_manual_review.py`
- Modify: `backend/apps/helpdesk/urls.py`
- Modify: `frontend/lib/helpdesk.ts`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/page.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/_components/ticket-list.tsx`
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/_components/manual-review-detail.tsx`
- Test: `backend/tests/test_helpdesk_manual_review.py`
- Test: `backend/tests/test_guests_list_filter.py`
- Test: `backend/tests/test_transitions_manual_review_overrides.py`

- [ ] **Step 1: Failing test — manual-review transitions are allowed**

```python
# backend/tests/test_transitions_manual_review_overrides.py
"""Plan F adds help-desk overrides from manual_review → checked_in / voided."""

from __future__ import annotations

import pytest

from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.transitions import apply_entry_transition, can_transition_entry
from apps.orgs.models import Organization


@pytest.fixture
def manual_review_guest(db) -> Guest:
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    return Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered",
        full_name="X", entry_status="manual_review",
    )


def test_manual_review_to_checked_in_is_allowed(manual_review_guest):
    assert can_transition_entry(manual_review_guest, to="checked_in") is True
    g = apply_entry_transition(manual_review_guest, to="checked_in")
    assert g.entry_status == "checked_in"
    assert g.checked_in_at is not None


def test_manual_review_to_voided_is_allowed(manual_review_guest):
    assert can_transition_entry(manual_review_guest, to="voided") is True
    g = apply_entry_transition(manual_review_guest, to="voided")
    assert g.entry_status == "voided"


def test_walkin_manual_review_to_voided(db):
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    g = Guest.objects.create(
        organization=org, event=event, guest_type="walk_in",
        full_name="W", entry_status="manual_review",
    )
    g = apply_entry_transition(g, to="voided")
    assert g.entry_status == "voided"
```

- [ ] **Step 2: Verify test fails**

```bash
cd backend && uv run pytest tests/test_transitions_manual_review_overrides.py -v
```

Expected: FAIL — `InvalidTransition`.

- [ ] **Step 3: Extend the transitions table**

In `backend/apps/guests/transitions.py`, add two rows to `_ENTRY_TABLE`:

```python
_ENTRY_TABLE: dict[tuple[str, str], set[str]] = {
    ("pre_registered", "registered_not_arrived"): {"checked_in", "manual_review"},
    ("walk_in", "displayed"): {"checked_in", "voided", "manual_review"},
    # Plan F: help-desk override authority (brief Appendix A row 8).
    ("pre_registered", "manual_review"): {"checked_in", "voided"},
    ("walk_in", "manual_review"): {"checked_in", "voided"},
}
```

- [ ] **Step 4: Run the test**

```bash
cd backend && uv run pytest tests/test_transitions_manual_review_overrides.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Failing test — guests list filter by entry_status**

```python
# backend/tests/test_guests_list_filter.py
"""GuestListView accepts ?entry_status=<status>."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         full_name="A", entry_status="checked_in")
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         full_name="B", entry_status="manual_review")
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         full_name="C", entry_status="manual_review")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event


def test_filter_by_manual_review(env):
    c, org, event = env
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/?entry_status=manual_review")
    assert r.status_code == 200
    results = r.json().get("results") or r.json()
    assert len(results) == 2
    assert all(g["entry_status"] == "manual_review" for g in results)


def test_no_filter_returns_all(env):
    c, org, event = env
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/")
    results = r.json().get("results") or r.json()
    assert len(results) == 3
```

- [ ] **Step 6: Verify test fails**

```bash
cd backend && uv run pytest tests/test_guests_list_filter.py -v
```

Expected: FAIL — filter currently ignored, returns all 3 rows.

- [ ] **Step 7: Add the filter to GuestListView**

In `backend/apps/guests/views.py`, modify `GuestListView.get_queryset`:

```python
def get_queryset(self):
    qs = Guest.objects.filter(
        organization=self.request.organization,
        event__slug=self.kwargs["event_slug"],
    )
    entry_status = self.request.query_params.get("entry_status")
    if entry_status:
        qs = qs.filter(entry_status=entry_status)
    return qs
```

- [ ] **Step 8: Run the test**

```bash
cd backend && uv run pytest tests/test_guests_list_filter.py -v
```

Expected: 2 passed.

- [ ] **Step 9: Failing test — manual-review resolve endpoint**

```python
# backend/tests/test_helpdesk_manual_review.py
"""POST /helpdesk/manual-review/<guest_id>/resolve/"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def env(django_user_model):
    user = django_user_model.objects.create(email="staff@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="staff", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    guest = Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered",
        full_name="X", entry_status="manual_review",
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event, guest


def test_approve_checkin_transitions_guest(env):
    c, org, event, guest = env
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/manual-review/{guest.id}/resolve/"
    r = c.post(url, data={"action": "approve_checkin", "notes": "verified"}, format="json")
    assert r.status_code == 200, r.content
    guest.refresh_from_db()
    assert guest.entry_status == "checked_in"
    assert guest.checked_in_at is not None
    audit = AuditEvent.objects.filter(action="helpdesk.manual_review_resolved").first()
    assert audit is not None
    assert audit.details_json["action"] == "approve_checkin"


def test_void_transitions_guest(env):
    c, org, event, guest = env
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/manual-review/{guest.id}/resolve/"
    r = c.post(url, data={"action": "void", "notes": ""}, format="json")
    assert r.status_code == 200
    guest.refresh_from_db()
    assert guest.entry_status == "voided"


def test_rejects_unknown_action(env):
    c, org, event, guest = env
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/manual-review/{guest.id}/resolve/"
    r = c.post(url, data={"action": "checked_in", "notes": ""}, format="json")
    assert r.status_code == 400


def test_rejects_non_manual_review_guest(env):
    c, org, event, _ = env
    other = Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered",
        full_name="Y", entry_status="checked_in",
    )
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/helpdesk/manual-review/{other.id}/resolve/"
    r = c.post(url, data={"action": "approve_checkin", "notes": ""}, format="json")
    assert r.status_code == 400
```

- [ ] **Step 10: Verify test fails**

```bash
cd backend && uv run pytest tests/test_helpdesk_manual_review.py -v
```

Expected: FAIL — URL not configured.

- [ ] **Step 11: Implement the resolve endpoint**

```python
# backend/apps/helpdesk/views_manual_review.py
"""POST /helpdesk/manual-review/<guest_id>/resolve/

Help-desk override authority per brief Appendix A row 8: staff role may
transition a manual_review guest to checked_in or voided. Both transitions
write a helpdesk.manual_review_resolved audit row.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import write_audit
from apps.common.permissions import IsOrgMember
from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.transitions import InvalidTransition, apply_entry_transition

_ALLOWED_ACTIONS = {"approve_checkin": "checked_in", "void": "voided"}


class ManualReviewResolveView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def post(self, request, org_slug, event_slug, guest_id):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        guest = get_object_or_404(Guest, id=guest_id, event=event)
        if guest.entry_status != "manual_review":
            raise ValidationError({"guest": "Not in manual_review state."})

        action = (request.data.get("action") or "").strip()
        if action not in _ALLOWED_ACTIONS:
            raise ValidationError({"action": f"Must be one of {sorted(_ALLOWED_ACTIONS)}."})
        notes = (request.data.get("notes") or "").strip()

        target = _ALLOWED_ACTIONS[action]
        try:
            guest = apply_entry_transition(guest, to=target)
        except InvalidTransition as exc:
            raise ValidationError({"transition": str(exc)}) from exc

        write_audit(
            organization=request.organization,
            event=event,
            guest=guest,
            actor_type="user",
            actor_id=str(request.user.id),
            action="helpdesk.manual_review_resolved",
            result="success",
            previous_status="manual_review",
            new_status=target,
            details={"action": action, "notes": notes, "guest_id": str(guest.id)},
        )
        return Response({
            "guest_id": str(guest.id),
            "entry_status": guest.entry_status,
        })
```

- [ ] **Step 12: Add the URL route**

In `backend/apps/helpdesk/urls.py`, append:

```python
from apps.helpdesk.views_manual_review import ManualReviewResolveView

urlpatterns += [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/helpdesk/manual-review/<uuid:guest_id>/resolve/",
        ManualReviewResolveView.as_view(),
        name="helpdesk-manual-review-resolve",
    ),
]
```

- [ ] **Step 13: Run the tests**

```bash
cd backend && uv run pytest tests/test_helpdesk_manual_review.py -v
```

Expected: 4 passed.

- [ ] **Step 14: Add frontend client functions for manual-review fetch + resolve**

In `frontend/lib/helpdesk.ts`, append:

```ts
export type ManualReviewGuest = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  guest_type: "pre_registered" | "walk_in";
  entry_status: "manual_review";
  info_status: string;
  updated_at: string;
};

type ManualReviewListResponse = {
  results: ManualReviewGuest[];
  count: number;
};

export function useManualReviewGuests(orgSlug: string, eventSlug: string, enabled: boolean) {
  return useSWR<ManualReviewListResponse>(
    enabled
      ? `/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/?entry_status=manual_review`
      : null,
    async (url) => {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return (await r.json()) as ManualReviewListResponse;
    },
    { refreshInterval: 5000 },
  );
}

export async function resolveManualReview(
  orgSlug: string,
  eventSlug: string,
  guestId: string,
  body: { action: "approve_checkin" | "void"; notes: string },
): Promise<{ guest_id: string; entry_status: string }> {
  const r = await fetch(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/helpdesk/manual-review/${guestId}/resolve/`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!r.ok) throw new Error(`${r.status}`);
  return await r.json();
}

export type InboxItem =
  | { type: "ticket"; key: string; sortAt: string; ticket: Ticket }
  | { type: "manual_review"; key: string; sortAt: string; guest: ManualReviewGuest };
```

- [ ] **Step 15: Build the manual-review detail pane**

```tsx
// frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/_components/manual-review-detail.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { type ManualReviewGuest, resolveManualReview } from "@/lib/helpdesk";

type Props = {
  guest: ManualReviewGuest;
  orgSlug: string;
  eventSlug: string;
  onChanged: () => void;
};

export function ManualReviewDetail({ guest, orgSlug, eventSlug, onChanged }: Props) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = (action: "approve_checkin" | "void") => async () => {
    setBusy(true);
    try {
      await resolveManualReview(orgSlug, eventSlug, guest.id, { action, notes });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Manual review · {guest.full_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <div>
            <span className="text-muted-foreground">Email: </span>
            {guest.email || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Phone: </span>
            {guest.phone || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Type: </span>
            {guest.guest_type}
          </div>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Resolution notes (optional)"
          rows={3}
        />
        <div className="flex gap-2">
          <Button onClick={resolve("approve_checkin")} disabled={busy} variant="default">
            Approve check-in
          </Button>
          <Button onClick={resolve("void")} disabled={busy} variant="destructive">
            Mark void
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 16: Update `TicketList` to handle InboxItem**

In `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/_components/ticket-list.tsx`, replace the existing component with an `InboxList` that renders both kinds:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { type InboxItem } from "@/lib/helpdesk";

type Props = {
  items: InboxItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export function InboxList({ items, selectedKey, onSelect }: Props) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No items match this filter.
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isSelected = item.key === selectedKey;
        const classes = `w-full text-left rounded-md border p-3 hover:bg-accent ${
          isSelected ? "border-primary bg-accent" : "border-border"
        }`;
        if (item.type === "ticket") {
          const t = item.ticket;
          const reason = (t.audit_event.details_json?.reason as string) || t.audit_event.action;
          return (
            <li key={item.key}>
              <button type="button" onClick={() => onSelect(item.key)} className={classes}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={t.claim_status === "open" ? "destructive" : "secondary"}>
                    {t.claim_status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.audit_event.occurred_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium">{reason}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {t.audit_event.entry_token.slice(0, 16)}…
                </div>
                {t.assigned_to_email ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Claimed by {t.assigned_to_email}
                  </div>
                ) : null}
              </button>
            </li>
          );
        }
        const g = item.guest;
        return (
          <li key={item.key}>
            <button type="button" onClick={() => onSelect(item.key)} className={classes}>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="destructive">manual review</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(g.updated_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium">{g.full_name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{g.email || g.phone || "—"}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 17: Update the helpdesk page to use chips + InboxList**

Replace `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/helpdesk/page.tsx` with the augmented version:

```tsx
"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  type InboxItem,
  useManualReviewGuests,
  useTickets,
} from "@/lib/helpdesk";

import { InboxList } from "./_components/ticket-list";
import { ManualReviewDetail } from "./_components/manual-review-detail";
import { TicketDetail } from "./_components/ticket-detail";

type Filter = "open" | "claimed" | "resolved" | "manual_review" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "claimed", label: "Claimed" },
  { value: "resolved", label: "Resolved" },
  { value: "manual_review", label: "Manual review" },
  { value: "all", label: "All" },
];

export default function HelpDeskPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const wantTickets = filter !== "manual_review";
  const wantManualReview = filter === "manual_review" || filter === "all";

  const ticketsQuery = useTickets(slug, eventSlug, filter === "manual_review" ? "open" : filter);
  const manualQuery = useManualReviewGuests(slug, eventSlug, wantManualReview);

  const items: InboxItem[] = useMemo(() => {
    const out: InboxItem[] = [];
    if (wantTickets) {
      for (const t of ticketsQuery.data?.results ?? []) {
        out.push({
          type: "ticket",
          key: `t-${t.id}`,
          sortAt: t.audit_event.occurred_at,
          ticket: t,
        });
      }
    }
    if (wantManualReview) {
      for (const g of manualQuery.data?.results ?? []) {
        out.push({
          type: "manual_review",
          key: `g-${g.id}`,
          sortAt: g.updated_at,
          guest: g,
        });
      }
    }
    return out.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  }, [wantTickets, wantManualReview, ticketsQuery.data, manualQuery.data]);

  const selected = items.find((i) => i.key === selectedKey) ?? items[0] ?? null;

  const refresh = () => {
    void ticketsQuery.mutate();
    void manualQuery.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Help desk</h1>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[40%_1fr]">
        <div>
          <InboxList
            items={items}
            selectedKey={selected?.key ?? null}
            onSelect={setSelectedKey}
          />
        </div>
        <div>
          {selected?.type === "ticket" ? (
            <TicketDetail
              ticket={selected.ticket}
              orgSlug={slug}
              eventSlug={eventSlug}
              onChanged={refresh}
            />
          ) : selected?.type === "manual_review" ? (
            <ManualReviewDetail
              guest={selected.guest}
              orgSlug={slug}
              eventSlug={eventSlug}
              onChanged={refresh}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select an item.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 18: Smoke test**

Locally or on staging:
- Visit the helpdesk page → 5 chips render
- "Open" / "Claimed" / "Resolved" / "All" behave as in Task 8
- "Manual review" → only guests with `entry_status="manual_review"` show
- Selecting a manual-review item → detail pane shows Approve / Void buttons
- "Approve check-in" → guest disappears from this list (state moved to `checked_in`), audit log gets a `helpdesk.manual_review_resolved` row
- Dashboard counts widget's "Manual review" tile drops by one within 5s

- [ ] **Step 19: Full backend suite**

```bash
cd backend && uv run pytest -q && uv run mypy apps/
```

Expected: 207+ tests pass (added 3 transitions + 2 list-filter + 4 manual-review = 9), mypy clean.

- [ ] **Step 20: Commit**

```bash
git add backend/apps/guests/transitions.py \
        backend/apps/guests/views.py \
        backend/apps/helpdesk/views_manual_review.py \
        backend/apps/helpdesk/urls.py \
        backend/tests/test_transitions_manual_review_overrides.py \
        backend/tests/test_guests_list_filter.py \
        backend/tests/test_helpdesk_manual_review.py \
        frontend/lib/helpdesk.ts \
        frontend/app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/helpdesk/
git commit -m "feat(helpdesk): manual-review chip + transition endpoints (completes unified queue)"
```

---

## Follow-up after merge (not part of this plan's task list)

These are the expected next-session activities after Plan F lands on `main` and staging:

1. **Write the Plan F verification checklist + findings** following Plan E's precedent:
   - `docs/plans/<date>-plan-f-verification-checklist.md` — the gating test script
   - `docs/plans/<date>-plan-f-verification-findings.md` — the verification report

   Verification scenarios to cover:
   - Help-desk inbox lists the 2 pre-existing Plan E escalations
   - Claim → assignee email shows on staging
   - Resolve with each of the 3 actions → `helpdesk.ticket_resolved` audit rows confirm via `/audit/`
   - Dashboard widget counts react within ≤6s of a check-in / escalation / conflict
   - Audit viewer ETag round-trip returns 304 on unchanged window
   - Direct `UPDATE audit_auditevent SET ...` via `flyctl ssh psql` raises an exception
   - Task 0 wave verification: iOS banner shows on real iPhone Chrome, reaper restores a synthetic `in_flight` stale row, retry-failed flips a failed row back to pending, dedupe prevents N rows for repeated invalid-token scans, online cache update visible in IndexedDB DevTools, GHA deploy triggers on a backend-touching merge, throttle returns 429 on the 11th `/devices/enroll/` in a minute

2. **Set `FLY_API_TOKEN` GitHub Actions secret** if Task 0b shipped without it being preset. Without this secret the workflow runs but fails on `flyctl deploy`.

3. **Update `docs/handoff-2026-05-20.md`** to mark Plan F items complete and add Plan G's parking lot (Telegram + CSV import + remaining pre-pilot QA).

4. **Plan G scope:** Telegram bot integration + CSV guest import (per brief §12 W12). The pre-pilot QA items in the current parking lot (`NEXT_PUBLIC_SENTRY_DSN`, branded PWA icons, Khmer translation review, Resend sender domain, Fly `ALLOWED_HOSTS` allowlist, Android Chrome E2E, iOS 7-day cache eviction doc) remain in Plan H.
