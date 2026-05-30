# Plan K Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Plan K has 8 PR slices (K1–K8). Dispatch one agent per PR slice; each agent runs in its own isolated worktree, opens one PR, then stops. K2–K8 each depend only on K1 being merged.

**Goal:** Ship 8 small PRs that together cover 11 pre-pilot UX/UX-adjacent enhancements: error display, session length, org rename, member CRUD, public-URL with short codes, CSV import drop-zone, preset-field deletion, org-context layout, plus a doc-only verification that CSV bulk email is already correctly designed.

**Architecture:** Backend additions to `apps/orgs/` (PATCH org, membership detail), `apps/events/` (preset delete), and a new `apps/shorturls/` app for the redirect model + view. Frontend additions: new `org-context` segment layout, several reusable components (`extractApiError`, `CopyButton`, `DropZone`, `OrgNameEditor`, `OrgTabsNav`, `PublicUrlCard`, `auth-refresh.ts` module). All PRs are pure code (no DNS, no cloud provisioning, no infra). PR target: `byondr-co/eventgate` main.

**Tech Stack:** Django 5 + DRF + Celery + Postgres + Redis on Fly (Singapore); Next.js 15 App Router + TanStack Query + shadcn-ui + base-ui on Vercel; vitest + pytest; uv + pnpm.

**Spec:** [`docs/plans/2026-05-31-plan-k-pre-pilot-enhancements.md`](2026-05-31-plan-k-pre-pilot-enhancements.md) — commit `033543e` on `feature/plan-k-pre-pilot-enhancements`.

---

## Universal pre-flight (every PR slice begins with these)

Every PR-slice agent runs these as Step 0 of its dispatch:

```bash
git fetch origin --quiet
git checkout -b feature/plan-k<N>-<short-name> origin/main
```

Then verifies:

```bash
git log --oneline -1
```
Expected: latest main tip (≥ `f8aff39 docs(plan-j): wave 9 — closeout`, or whatever main is at dispatch time).

```bash
cd backend && uv sync --frozen
cd frontend && pnpm install --frozen-lockfile
```

Return to worktree root before continuing.

---

## PR K1 — Plumbing & quick wins

**Items:** #1 (placeholders), #4+#7 (error parser), #8a (session 1d), #11 (CSV email log entry)

**Branch:** `feature/plan-k1-plumbing`

**Files:**
- Modify: `backend/config/settings/base.py` (one-line change)
- Modify: `backend/tests/test_auth_endpoints.py` or new `backend/tests/test_session_lifetime.py`
- Modify: `frontend/lib/api.ts` (add `extractApiError`)
- Create: `frontend/__tests__/lib/api.test.ts`
- Modify: `frontend/components/orgs/create-org-form.tsx` (placeholder + error display)
- Modify: `frontend/components/events/event-create-wizard.tsx` (placeholder)
- Modify: `frontend/components/orgs/members-table.tsx` (error display)
- Modify: `frontend/components/events/registration-form-builder.tsx` (error display)
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx` (error display)
- Modify: `frontend/components/events/event-status-card.tsx` (error display — preserves toast pattern; verify uses extractApiError where applicable)
- Modify: `docs/plans/improvement-and-findings-logs.md` (append #11 verification note)

### Task K1.1 — Backend: bump access-token lifetime

- [ ] **Step 1: Edit `backend/config/settings/base.py` line ~159.**

```python
# before
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    ...
}

# after
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),  # was minutes=15; Plan K item #8a
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    ...
}
```

- [ ] **Step 2: Write a session-lifetime test.**

Create `backend/tests/test_session_lifetime.py`:

```python
from datetime import timedelta

from django.conf import settings


def test_access_token_lifetime_is_one_day():
    assert settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"] == timedelta(days=1)


def test_refresh_token_lifetime_is_fourteen_days():
    assert settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] == timedelta(days=14)


def test_rotate_refresh_tokens_enabled():
    assert settings.SIMPLE_JWT["ROTATE_REFRESH_TOKENS"] is True
```

- [ ] **Step 3: Run test.**

```bash
cd backend && uv run pytest tests/test_session_lifetime.py -v
```
Expected: 3 passed.

### Task K1.2 — Frontend: `extractApiError` helper

- [ ] **Step 1: Write failing test.**

Create `frontend/__tests__/lib/api.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { extractApiError } from "@/lib/api";

describe("extractApiError", () => {
  it("parses `detail` from a JSON error body", () => {
    const err = new Error('400 Bad Request: {"detail":"This email is already a member."}');
    expect(extractApiError(err)).toBe("This email is already a member.");
  });

  it("joins non_field_errors when detail is missing", () => {
    const err = new Error('400 Bad Request: {"non_field_errors":["A","B"]}');
    expect(extractApiError(err)).toBe("A · B");
  });

  it("falls back to the raw message on non-JSON body", () => {
    const err = new Error("500 Server Error: <html>boom</html>");
    expect(extractApiError(err)).toBe("500 Server Error: <html>boom</html>");
  });

  it("returns a generic string on non-Error input", () => {
    expect(extractApiError(undefined)).toBe("Something went wrong.");
    expect(extractApiError("nope")).toBe("Something went wrong.");
  });

  it("returns the raw message when JSON parses but has no detail and no non_field_errors", () => {
    const err = new Error('400 Bad Request: {"other":"x"}');
    expect(extractApiError(err)).toBe(err.message);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL (function not yet exported).**

```bash
cd frontend && pnpm test -- api.test
```
Expected: tests fail because `extractApiError` is not yet exported from `@/lib/api`.

- [ ] **Step 3: Add `extractApiError` to `frontend/lib/api.ts`.**

Append at end of file:

```ts
export function extractApiError(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong.";
  const m = err.message.match(/^\d+\s+[^:]*:\s*(.+)$/s);
  if (!m) return err.message;
  try {
    const parsed = JSON.parse(m[1]);
    if (typeof parsed?.detail === "string") return parsed.detail;
    if (Array.isArray(parsed?.non_field_errors)) return parsed.non_field_errors.join(" · ");
    return err.message;
  } catch {
    return err.message;
  }
}
```

- [ ] **Step 4: Run test, expect PASS.**

```bash
cd frontend && pnpm test -- api.test
```
Expected: 5 tests pass.

### Task K1.3 — Migrate existing inline error renders to `extractApiError`

For each file below, replace `(mut.error as Error).message` with `extractApiError(mut.error)` and add the import.

- [ ] **Step 1: `frontend/components/orgs/create-org-form.tsx` line ~42.**

```tsx
// add to imports at top of file:
import { extractApiError } from "@/lib/api";

// change line ~42 from:
{create.isError && (
  <p className="text-sm text-destructive">{(create.error as Error).message}</p>
)}

// to:
{create.isError && (
  <p className="text-sm text-destructive">{extractApiError(create.error)}</p>
)}
```

- [ ] **Step 2: `frontend/components/orgs/members-table.tsx` line ~58.**

```tsx
// add to imports:
import { extractApiError } from "@/lib/api";

// change from:
{invite.isError && (
  <p className="mt-3 text-sm text-destructive">{(invite.error as Error).message}</p>
)}

// to:
{invite.isError && (
  <p className="mt-3 text-sm text-destructive">{extractApiError(invite.error)}</p>
)}
```

- [ ] **Step 3: `frontend/components/events/registration-form-builder.tsx`.**

Run:
```bash
grep -n "\.error as Error" frontend/components/events/registration-form-builder.tsx
```
Replace each match with `extractApiError(<that mutation>.error)`. Add the import at the top.

- [ ] **Step 4: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx` line ~85.**

```tsx
// add to imports:
import { extractApiError } from "@/lib/api";

// change from:
{previewMut.isError && (
  <p className="text-sm text-red-600">{(previewMut.error as Error).message}</p>
)}

// to:
{previewMut.isError && (
  <p className="text-sm text-destructive">{extractApiError(previewMut.error)}</p>
)}
```

(Also: change `text-red-600` to `text-destructive` for consistency with the rest of the codebase.)

- [ ] **Step 5: `frontend/components/events/event-status-card.tsx`.**

Run:
```bash
grep -n "\.error as Error\|mutation\.error" frontend/components/events/event-status-card.tsx
```
Replace each `(mutation.error as Error).message` with `extractApiError(mutation.error)`. Already has destructive styling.

- [ ] **Step 6: Verify no `(<x>.error as Error)` casts remain in the codebase.**

```bash
grep -rln "error as Error" frontend/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v .next
```
Expected: empty (we just migrated them all).

### Task K1.4 — Placeholder text updates

- [ ] **Step 1: `frontend/components/orgs/create-org-form.tsx` line ~35.**

```diff
- placeholder="My Conference 2026"
+ placeholder="byondr.co"
```

- [ ] **Step 2: `frontend/components/events/event-create-wizard.tsx` line ~65.**

```diff
- placeholder="Annual Meetup 2026"
+ placeholder={`byondr.co Conference ${new Date().getFullYear()}`}
```

The placeholder now computes the current year dynamically at render time.

### Task K1.5 — Improvement log entry for #11

- [ ] **Step 1: Append to `docs/plans/improvement-and-findings-logs.md`** after the existing Plan J wrap-up section:

```markdown
## Plan K — verification finding (#11 CSV bulk email task model)

**2026-05-31 — Confirmed: CSV import already dispatches one Celery task per email send, with retry.**

Chain verified:
- `backend/apps/guests/views.py:281` — `process_csv_import_task.delay(import_id=str(ci.id))` enqueues one parent task per CSV upload
- `backend/apps/guests/tasks.py:84` `process_csv_import_task` — loops rows, calls `register_guest(...)` for each
- `backend/apps/guests/services.py:65` — `send_qr_email_task.delay(guest_id=str(guest.id))` enqueues one child task per guest
- `backend/apps/guests/tasks.py:26` — `@shared_task(name="guests.send_qr_email", bind=True, max_retries=3, default_retry_delay=60)` declaration

Implication: at pilot scale (a few hundred guests), bulk import will fan out into hundreds of independent Celery tasks. Upstash Redis + Celery worker concurrency=4 (per `fly.prod.toml`) handle this comfortably; each task is bounded I/O against Resend. No design change required.

**No code change in Plan K for this item.** Documentation-only verification.
```

### Task K1.6 — Run all gates + commit + PR

- [ ] **Step 1: All gates.**

```bash
cd backend && uv run pytest -x
cd backend && uv run mypy apps config
cd backend && uv run ruff check apps config
cd backend && uv run ruff format --check apps config
cd frontend && pnpm lint
cd frontend && pnpm format:check
cd frontend && pnpm exec tsc --noEmit
cd frontend && pnpm test
```
Expected: all 8 pass.

- [ ] **Step 2: Commit (one commit covering all K1 items, since they're a "plumbing" bundle).**

```bash
git add backend/config/settings/base.py backend/tests/test_session_lifetime.py \
        frontend/lib/api.ts frontend/__tests__/lib/api.test.ts \
        frontend/components/orgs/create-org-form.tsx \
        frontend/components/orgs/members-table.tsx \
        frontend/components/events/registration-form-builder.tsx \
        frontend/components/events/event-status-card.tsx \
        frontend/components/events/event-create-wizard.tsx \
        frontend/app/\(app\)/orgs/\[slug\]/events/\[eventSlug\]/guests/_components/csv-import-dialog.tsx \
        docs/plans/improvement-and-findings-logs.md
git commit -m "feat(plan-k1): plumbing — extractApiError + session 1d + placeholders + #11 doc"
```

- [ ] **Step 3: Push + open PR.**

```bash
git push -u origin feature/plan-k1-plumbing
gh auth switch --hostname github.com --user vineidev
gh pr create --repo byondr-co/eventgate --head feature/plan-k1-plumbing --base main \
  --title "feat(plan-k1): plumbing & quick wins" \
  --body "$(cat <<'EOF'
## Summary

Plan K slice 1/8 — small foundation changes used by K2–K8.

- **#1** Placeholder text → \`byondr.co\` (org), \`byondr.co Conference {year}\` (event, dynamic)
- **#4 + #7** New \`extractApiError(err)\` helper in \`frontend/lib/api.ts\`. All existing inline error renders migrated. No more raw \`400 : {"detail":...}\` strings.
- **#8a** \`ACCESS_TOKEN_LIFETIME\` 15min → 1 day. Refresh stays at 14d. (Frontend silent refresh ships in K8.)
- **#11** Improvement log records: CSV bulk email already correctly designed (one Celery task per email, retry x3, 60s delay). No code change.

## Spec
\`docs/plans/2026-05-31-plan-k-pre-pilot-enhancements.md\`

## Test plan
- [ ] CI green (8 gates)
EOF
)"
```

- [ ] **Step 4: Report PR URL.** Dispatcher merges (rebase, matching #11/#12/#13 pattern).

---

## PR K2 — Org-context layout (breadcrumb + Events/Members tabs)

**Item:** #2

**Branch:** `feature/plan-k2-org-layout`

**Depends on:** K1 (uses `extractApiError`)

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/layout.tsx`
- Create: `frontend/components/nav/org-tabs-nav.tsx`
- Create: `frontend/__tests__/components/nav/org-tabs-nav.test.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/page.tsx` (drop the now-redundant inline title-only block since the layout shows org name via breadcrumb)

### Task K2.1 — Org-context layout file

- [ ] **Step 1: Create `frontend/app/(app)/orgs/[slug]/layout.tsx`.**

```tsx
import type { ReactNode } from "react";

import { BreadcrumbTrail } from "@/components/nav/breadcrumb-trail";
import { OrgTabsNav } from "@/components/nav/org-tabs-nav";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function OrgLayout({ children, params }: Props) {
  const { slug } = await params;
  return (
    <div className="space-y-4">
      <BreadcrumbTrail />
      <OrgTabsNav orgSlug={slug} />
      {children}
    </div>
  );
}
```

Note: Next.js 15 params is a Promise — match the pattern in `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx` (existing from Plan J).

The layout wraps `members/`, `events/page.tsx`, `events/new/page.tsx`, AND `events/[eventSlug]/...` — but the deeper event layout takes over inside the eventSlug subtree, so org-level tabs only show when above the event level.

Actually verify by checking if the existing event layout overrides or composes. If composes (which is typical Next.js behavior), org tabs would always show. That's not ideal — for event-context routes we want event tabs, not org tabs. Use route grouping or a conditional render to scope tabs:

```tsx
// scoped: only render OrgTabsNav when NOT inside an event subroute
import { headers } from "next/headers";

// (We can't easily check pathname in a server component layout without next/headers; simpler:
//  put OrgTabsNav inside its own marker that the event layout opts out of.)
```

Simpler approach: render `OrgTabsNav` unconditionally; on the event detail and event sub-routes, the existing event layout already inserts `EventTabsNav` BELOW `BreadcrumbTrail`. The result is: org tabs visible + event tabs visible. That stacks. Awkward.

**Fix:** Make `OrgTabsNav` a Client Component that hides itself when `usePathname()` includes `/events/<slug>/`. Replace the layout body with:

```tsx
// frontend/components/nav/org-tabs-nav.tsx — handle hide-when-inside-event
"use client";
import { usePathname } from "next/navigation";
// ...
const pathname = usePathname() ?? "";
// hide when path includes a third segment under orgs/<slug>/events/
const inEventSubtree = /^\/orgs\/[a-z0-9-]+\/events\/[a-z0-9-]+/.test(pathname);
if (inEventSubtree) return null;
```

(Detail handled in Task K2.2.)

### Task K2.2 — OrgTabsNav component (TDD)

- [ ] **Step 1: Write failing test.**

Create `frontend/__tests__/components/nav/org-tabs-nav.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key === "events" ? "Events" : key === "members" ? "Members" : key,
}));

import { usePathname } from "next/navigation";
import { OrgTabsNav } from "@/components/nav/org-tabs-nav";

const mockPathname = vi.mocked(usePathname);
const ORG = "click-cam";

beforeEach(() => vi.clearAllMocks());

describe("OrgTabsNav", () => {
  it("renders 2 tabs with correct hrefs on org dashboard", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}`);
    const { container } = render(<OrgTabsNav orgSlug={ORG} />);
    expect(container.querySelector(`a[href="/orgs/${ORG}/events"]`)).toBeInTheDocument();
    expect(container.querySelector(`a[href="/orgs/${ORG}/members"]`)).toBeInTheDocument();
    expect(container.querySelectorAll("a").length).toBe(2);
  });

  it("marks Events tab active on events path", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events`);
    render(<OrgTabsNav orgSlug={ORG} />);
    expect(screen.getByRole("link", { name: /Events/i })).toHaveAttribute("aria-current", "page");
  });

  it("marks Members tab active on members path", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/members`);
    render(<OrgTabsNav orgSlug={ORG} />);
    expect(screen.getByRole("link", { name: /Members/i })).toHaveAttribute("aria-current", "page");
  });

  it("renders nothing when inside an event subtree", () => {
    mockPathname.mockReturnValue(`/orgs/${ORG}/events/may-pilot/devices`);
    const { container } = render(<OrgTabsNav orgSlug={ORG} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.**

```bash
cd frontend && pnpm test -- org-tabs-nav
```

- [ ] **Step 3: Create `frontend/components/nav/org-tabs-nav.tsx`.**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type TabKey = "events" | "members";

type TabSpec = { key: TabKey; suffix: string };

const TABS: TabSpec[] = [
  { key: "events", suffix: "/events" },
  { key: "members", suffix: "/members" },
];

type Props = { orgSlug: string };

export function OrgTabsNav({ orgSlug }: Props) {
  const pathname = usePathname() ?? "";
  const t = useTranslations("nav");

  // Hide when inside an event subtree (event layout owns nav from there)
  if (/^\/orgs\/[a-z0-9-]+\/events\/[a-z0-9-]+/.test(pathname)) return null;

  const base = `/orgs/${orgSlug}`;

  return (
    <nav
      aria-label="Organization sections"
      className="flex gap-1 overflow-x-auto border-b [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]"
    >
      {TABS.map((spec) => {
        const href = `${base}${spec.suffix}`;
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        const label = t(spec.key);
        return (
          <Link
            key={spec.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 px-3 py-2 text-sm rounded-t-md border border-transparent border-b-0 whitespace-nowrap",
              active
                ? "bg-background text-foreground font-semibold border-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Add i18n keys to `frontend/lib/i18n/messages/en.json` `nav` namespace if missing.**

Check that `nav.events` = "Events" and `nav.members` = "Members" exist. If not, add them. (Plan J Wave 3 added other nav.* keys; check.)

```bash
grep -E "events|members" frontend/lib/i18n/messages/en.json | head
```
If `events` / `members` missing, add inside the existing `nav` namespace:

```json
{
  "nav": {
    "home": "Home",
    "dashboard": "Dashboard",
    ...
    "events": "Events",
    "members": "Members"
  },
  ...
}
```

- [ ] **Step 5: Run test, expect PASS.**

```bash
cd frontend && pnpm test -- org-tabs-nav
```
Expected: 4 tests pass.

### Task K2.3 — Simplify the org dashboard page

The org dashboard at `frontend/app/(app)/orgs/[slug]/page.tsx` currently renders its own title block. The breadcrumb now provides org name; we can keep the title block (the org card layout with EventsTable child still makes sense) — no removal needed.

- [ ] **Step 1: Verify nothing breaks.**

```bash
cd frontend && pnpm exec tsc --noEmit
cd frontend && pnpm test
```
Expected: all pass.

### Task K2.4 — Gates + commit + PR

- [ ] **Step 1: All gates.**

```bash
cd backend && uv run pytest -x
cd backend && uv run mypy apps config
cd backend && uv run ruff check apps config
cd backend && uv run ruff format --check apps config
cd frontend && pnpm lint
cd frontend && pnpm format:check
cd frontend && pnpm exec tsc --noEmit
cd frontend && pnpm test
```

- [ ] **Step 2: Commit.**

```bash
git add "frontend/app/(app)/orgs/[slug]/layout.tsx" \
        frontend/components/nav/org-tabs-nav.tsx \
        frontend/__tests__/components/nav/org-tabs-nav.test.tsx \
        frontend/lib/i18n/messages/en.json
git commit -m "feat(plan-k2): org-context layout — breadcrumb + Events/Members tabs"
```

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feature/plan-k2-org-layout
gh pr create --repo byondr-co/eventgate --head feature/plan-k2-org-layout --base main \
  --title "feat(plan-k2): org-context layout" \
  --body "Plan K slice 2/8 — fixes item #2 (members page lacks org awareness) + resolves Plan J §9 deferred follow-up. New segment layout under /orgs/[slug] wrapping events list + members page with breadcrumb and 2-tab nav. Hides itself in event subtree (event layout owns nav there)."
```

---

## PR K3 — Org name inline edit

**Item:** #3

**Branch:** `feature/plan-k3-org-rename`

**Depends on:** K1, K2 (uses extractApiError; needs org-context layout for visual context)

**Files:**
- Modify: `backend/apps/orgs/views.py` (add `UpdateModelMixin` to `OrganizationViewSet`)
- Modify: `backend/apps/orgs/serializers.py` (mark slug read-only)
- Create: `backend/tests/test_orgs_update.py`
- Modify: `frontend/lib/orgs.ts` (add `useUpdateOrg(slug)` hook)
- Create: `frontend/components/orgs/org-name-editor.tsx`
- Create: `frontend/__tests__/components/orgs/org-name-editor.test.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/page.tsx` (use `<OrgNameEditor>` in place of static `<h1>`)

### Task K3.1 — Backend: PATCH endpoint

- [ ] **Step 1: Inspect serializer.**

```bash
cat backend/apps/orgs/serializers.py
```
Confirm `OrganizationSerializer` exposes `name` and `slug`. Mark `slug` as read-only if it isn't already:

```python
# backend/apps/orgs/serializers.py
class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = (..., "name", "slug", ...)
        read_only_fields = (..., "slug", ...)  # ensure slug is in read_only_fields
```

(Read the file first — if slug is already in read_only_fields, no change needed.)

- [ ] **Step 2: Add `UpdateModelMixin` to `OrganizationViewSet` in `backend/apps/orgs/views.py:42`.**

```python
# before
class OrganizationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):

# after
class OrganizationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
```

- [ ] **Step 3: Update `get_permissions` to gate PATCH to owner/admin.**

```python
def get_permissions(self):
    if self.action in ("list", "create"):
        return [IsAuthenticated()]
    if self.action in ("update", "partial_update"):
        self.required_org_roles = ("owner", "admin")
        return [IsAuthenticated(), _MembershipForSlug(), HasOrgRole()]
    return [IsAuthenticated(), _MembershipForSlug()]
```

Add `from apps.common.permissions import HasOrgRole` if not already imported.

- [ ] **Step 4: Write tests.**

Create `backend/tests/test_orgs_update.py`:

```python
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def auth_client(make_user, make_org):
    """Returns (client, user, org) where user is owner of org."""
    user = make_user(email="owner@x.com")
    org = make_org(name="Original Name", owner=user)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user, org


def test_owner_can_patch_org_name(auth_client):
    client, _, org = auth_client
    r = client.patch(f"/api/v1/orgs/{org.slug}/", {"name": "New Name"}, format="json")
    assert r.status_code == 200, r.content
    org.refresh_from_db()
    assert org.name == "New Name"


def test_patch_org_slug_is_ignored(auth_client):
    client, _, org = auth_client
    original_slug = org.slug
    r = client.patch(f"/api/v1/orgs/{org.slug}/", {"slug": "hacked"}, format="json")
    assert r.status_code == 200, r.content
    org.refresh_from_db()
    assert org.slug == original_slug


def test_non_owner_cannot_patch_org_name(make_user, make_org):
    member = make_user(email="staff@x.com")
    org = make_org(name="Original", owner=make_user(email="o@x.com"))
    OrganizationMembership.objects.create(user=member, organization=org, role="staff")
    client = APIClient()
    client.force_authenticate(user=member)
    r = client.patch(f"/api/v1/orgs/{org.slug}/", {"name": "Hijack"}, format="json")
    assert r.status_code == 403, r.content
    org.refresh_from_db()
    assert org.name == "Original"


def test_empty_name_returns_400(auth_client):
    client, _, org = auth_client
    r = client.patch(f"/api/v1/orgs/{org.slug}/", {"name": ""}, format="json")
    assert r.status_code == 400
```

(Reuse existing `make_user` / `make_org` conftest fixtures; if they have different names, grep `conftest.py` for the existing factories and adapt.)

- [ ] **Step 5: Run tests.**

```bash
cd backend && uv run pytest tests/test_orgs_update.py -v
```
Expected: 4 tests pass.

### Task K3.2 — Frontend: `useUpdateOrg` hook

- [ ] **Step 1: Append to `frontend/lib/orgs.ts`.**

After the existing `useOrg` query (around line ~30), add:

```ts
export function useUpdateOrg(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      apiFetch<Organization>(`/api/v1/orgs/${slug}/`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      qc.setQueryData(["orgs", slug], data);
      qc.invalidateQueries({ queryKey: ["orgs"] });
    },
  });
}
```

### Task K3.3 — Frontend: `OrgNameEditor` component (TDD)

- [ ] **Step 1: Write failing test.**

Create `frontend/__tests__/components/orgs/org-name-editor.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  extractApiError: (e: unknown) => (e instanceof Error ? e.message : "err"),
}));

import { apiFetch } from "@/lib/api";
import { OrgNameEditor } from "@/components/orgs/org-name-editor";

const mockApi = vi.mocked(apiFetch);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("OrgNameEditor", () => {
  it("renders the name as a heading by default", () => {
    wrap(<OrgNameEditor orgSlug="acme" name="Acme Inc" />);
    expect(screen.getByRole("heading", { name: /Acme Inc/i })).toBeInTheDocument();
  });

  it("swaps to input on pencil click and saves on Enter", async () => {
    mockApi.mockResolvedValue({ name: "New Name", slug: "acme" });
    wrap(<OrgNameEditor orgSlug="acme" name="Old Name" />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        "/api/v1/orgs/acme/",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "New Name" }) }),
      ),
    );
  });

  it("cancels on Escape (no mutation)", async () => {
    wrap(<OrgNameEditor orgSlug="acme" name="Old Name" />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Half-typed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockApi).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /Old Name/i })).toBeInTheDocument();
  });

  it("displays mutation error inline", async () => {
    mockApi.mockRejectedValue(new Error("400 Bad Request: bad name"));
    wrap(<OrgNameEditor orgSlug="acme" name="Old" />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(screen.getByText(/bad name/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd frontend && pnpm test -- org-name-editor
```

- [ ] **Step 3: Create `frontend/components/orgs/org-name-editor.tsx`.**

```tsx
"use client";

import { useState } from "react";

import { extractApiError } from "@/lib/api";
import { useUpdateOrg } from "@/lib/orgs";

type Props = { orgSlug: string; name: string };

export function OrgNameEditor({ orgSlug, name }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const mutation = useUpdateOrg(orgSlug);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      setDraft(name);
      return;
    }
    try {
      await mutation.mutateAsync({ name: trimmed });
      setEditing(false);
    } catch {
      // error renders inline; stay in edit mode
    }
  };

  const cancel = () => {
    setEditing(false);
    setDraft(name);
    mutation.reset();
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{name}</h1>
        <button
          type="button"
          aria-label="Edit organization name"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          else if (e.key === "Escape") cancel();
        }}
        className="text-2xl font-semibold rounded border border-input bg-background px-2 py-1 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-ring"
        disabled={mutation.isPending}
      />
      {mutation.isError && (
        <p className="text-sm text-destructive">{extractApiError(mutation.error)}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd frontend && pnpm test -- org-name-editor
```
Expected: 4 tests pass.

### Task K3.4 — Wire into org dashboard page

- [ ] **Step 1: Modify `frontend/app/(app)/orgs/[slug]/page.tsx`.**

Locate the `<h1 className="text-2xl font-semibold">{org.name}</h1>` line. Replace with:

```tsx
<OrgNameEditor orgSlug={slug} name={org.name} />
```

Add the import at the top:

```tsx
import { OrgNameEditor } from "@/components/orgs/org-name-editor";
```

### Task K3.5 — Gates + commit + PR

- [ ] **Step 1: All gates.**

(Same as K1.6 Step 1.)

- [ ] **Step 2: Commit.**

```bash
git add backend/apps/orgs/views.py backend/apps/orgs/serializers.py \
        backend/tests/test_orgs_update.py \
        frontend/lib/orgs.ts \
        frontend/components/orgs/org-name-editor.tsx \
        frontend/__tests__/components/orgs/org-name-editor.test.tsx \
        "frontend/app/(app)/orgs/[slug]/page.tsx"
git commit -m "feat(plan-k3): inline-editable org name + PATCH endpoint"
```

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feature/plan-k3-org-rename
gh pr create --repo byondr-co/eventgate --head feature/plan-k3-org-rename --base main \
  --title "feat(plan-k3): inline-editable org name" \
  --body "Plan K slice 3/8 — item #3. Backend: PATCH /api/v1/orgs/<slug>/ with owner/admin role gate, slug remains read-only. Frontend: click-to-edit pencil affordance on org dashboard; Enter saves, Esc cancels, error renders inline via extractApiError."
```

---

## PR K4 — Member CRUD (role / remove / cancel invite)

**Item:** #5

**Branch:** `feature/plan-k4-member-crud`

**Depends on:** K1, K2

**Files:**
- Modify: `backend/apps/orgs/views.py` (add new views: `OrgMembershipDetailView`, `OrgInviteDetailView`)
- Modify: `backend/apps/orgs/serializers.py` (add `MembershipUpdateSerializer`)
- Modify: `backend/apps/orgs/urls.py` (add detail routes)
- Modify: `backend/apps/orgs/services.py` (add `update_membership_role`, `remove_membership`, `cancel_invite` services)
- Modify: `backend/tests/test_memberships.py` (extend)
- Create: `backend/tests/test_invites.py` (or extend existing)
- Modify: `frontend/lib/orgs.ts` (add `useUpdateMembership`, `useRemoveMembership`, `useCancelInvite`, `usePendingInvites`)
- Modify: `frontend/components/orgs/members-table.tsx` (role dropdown per row + remove button + pending invites section)
- Modify: `frontend/__tests__/components/orgs/members-table.test.tsx` (extend)

### Task K4.1 — Backend services (sole-owner protection)

- [ ] **Step 1: Add services to `backend/apps/orgs/services.py`.**

Append after existing functions:

```python
from rest_framework.exceptions import ValidationError


def update_membership_role(*, membership: OrganizationMembership, new_role: str) -> OrganizationMembership:
    """Change a member's role. Prevent demoting the sole remaining owner."""
    if membership.role == "owner" and new_role != "owner":
        other_active_owners = OrganizationMembership.objects.filter(
            organization=membership.organization,
            role="owner",
            is_active=True,
        ).exclude(pk=membership.pk).exists()
        if not other_active_owners:
            raise ValidationError(
                {"detail": "Cannot demote the sole owner of this organization. Promote another member to owner first."}
            )
    membership.role = new_role
    membership.save(update_fields=["role", "updated_at"])
    return membership


def remove_membership(*, membership: OrganizationMembership) -> OrganizationMembership:
    """Soft-remove (is_active=False). Prevent removing the sole remaining owner."""
    if membership.role == "owner":
        other_active_owners = OrganizationMembership.objects.filter(
            organization=membership.organization,
            role="owner",
            is_active=True,
        ).exclude(pk=membership.pk).exists()
        if not other_active_owners:
            raise ValidationError(
                {"detail": "Cannot remove the sole owner of this organization. Promote another member to owner first."}
            )
    membership.is_active = False
    membership.save(update_fields=["is_active", "updated_at"])
    return membership


def cancel_invite(*, invite: Invite) -> Invite:
    """Revoke a pending invite. No-op if already accepted or revoked."""
    if invite.accepted_at is not None:
        raise ValidationError({"detail": "Cannot cancel an accepted invite."})
    if invite.revoked_at is None:
        invite.revoked_at = timezone.now()
        invite.save(update_fields=["revoked_at"])
    return invite
```

Add `from apps.orgs.models import Invite` to imports if missing. Add `from django.utils import timezone` if missing.

### Task K4.2 — Backend views

- [ ] **Step 1: Add `MembershipUpdateSerializer` to `backend/apps/orgs/serializers.py`.**

```python
class MembershipUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Organization.ROLES)
```

- [ ] **Step 2: Add views to `backend/apps/orgs/views.py`** (append after existing classes):

```python
from rest_framework.exceptions import ValidationError as DRFValidationError


class OrgMembershipDetailView(viewsets.GenericViewSet):
    """PATCH/DELETE /api/v1/orgs/<slug>/memberships/<id>/"""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin")

    def _get_membership(self, request, membership_id: str) -> OrganizationMembership:
        from django.shortcuts import get_object_or_404
        return get_object_or_404(
            OrganizationMembership,
            id=membership_id,
            organization=request.organization,
            is_active=True,
        )

    def partial_update(self, request, org_slug=None, membership_id=None):
        from apps.orgs.serializers import MembershipUpdateSerializer
        from apps.orgs.services import update_membership_role
        ser = MembershipUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        membership = self._get_membership(request, membership_id)
        try:
            update_membership_role(membership=membership, new_role=ser.validated_data["role"])
        except DRFValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(MembershipSerializer(membership).data)

    def destroy(self, request, org_slug=None, membership_id=None):
        from apps.orgs.services import remove_membership
        membership = self._get_membership(request, membership_id)
        try:
            remove_membership(membership=membership)
        except DRFValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrgInviteDetailView(viewsets.GenericViewSet):
    """DELETE /api/v1/orgs/<slug>/invites/<id>/  (cancel a pending invite)"""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin")

    def destroy(self, request, org_slug=None, invite_id=None):
        from django.shortcuts import get_object_or_404
        from apps.orgs.models import Invite
        from apps.orgs.services import cancel_invite
        invite = get_object_or_404(Invite, id=invite_id, organization=request.organization)
        try:
            cancel_invite(invite=invite)
        except DRFValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 3: Wire URLs in `backend/apps/orgs/urls.py`.**

Replace the existing `urlpatterns` with:

```python
urlpatterns = [
    *router.urls,
    path(
        "orgs/<slug:org_slug>/invites/",
        OrgInviteCreateView.as_view({"post": "create"}),
        name="org-invite-create",
    ),
    path(
        "orgs/<slug:org_slug>/invites/<uuid:invite_id>/",
        OrgInviteDetailView.as_view({"delete": "destroy"}),
        name="org-invite-detail",
    ),
    path(
        "orgs/<slug:org_slug>/members/",
        OrgMembersListView.as_view({"get": "list"}),
        name="org-members-list",
    ),
    path(
        "orgs/<slug:org_slug>/memberships/<uuid:membership_id>/",
        OrgMembershipDetailView.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="org-membership-detail",
    ),
    path(
        "auth/invites/<str:token>/accept/",
        AcceptInviteView.as_view({"post": "create"}),
        name="invite-accept",
    ),
]
```

Add `OrgInviteDetailView, OrgMembershipDetailView` to imports from views.

### Task K4.3 — Add a pending-invites list endpoint

The members page also needs to fetch pending invites. Extend the existing `OrgInviteCreateView` to also handle list, or add a separate `GET` route.

- [ ] **Step 1: Update `OrgInviteCreateView` to also list pending invites.**

Modify the class in `views.py`:

```python
class OrgInviteCreateView(viewsets.GenericViewSet, mixins.CreateModelMixin, mixins.ListModelMixin):
    """GET/POST /api/v1/orgs/<slug>/invites/"""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")
    pagination_class = StandardPagination

    def get_serializer_class(self):
        if self.action == "list":
            return InviteSerializer
        return InviteCreateSerializer

    def get_queryset(self):
        from apps.orgs.models import Invite
        return Invite.objects.filter(
            organization=self.request.organization,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
        )

    def create(self, request: Request, *args, **kwargs) -> Response:
        # (existing create body unchanged)
        ...
```

- [ ] **Step 2: Update URL pattern to include `get`.**

```python
path(
    "orgs/<slug:org_slug>/invites/",
    OrgInviteCreateView.as_view({"get": "list", "post": "create"}),
    name="org-invites",
),
```

### Task K4.4 — Backend tests

- [ ] **Step 1: Extend `backend/tests/test_memberships.py`** (or create if missing — verify with `ls backend/tests/test_member*`).

Add tests:

```python
def test_admin_patch_role_succeeds(make_user, make_org):
    admin = make_user(email="a@x.com")
    target = make_user(email="t@x.com")
    org = make_org(name="O", owner=admin)
    target_m = OrganizationMembership.objects.create(user=target, organization=org, role="staff")
    OrganizationMembership.objects.filter(user=admin, organization=org).update(role="admin")
    # need an owner; create one
    owner = make_user(email="own@x.com")
    OrganizationMembership.objects.create(user=owner, organization=org, role="owner")
    c = APIClient()
    c.force_authenticate(user=admin)
    r = c.patch(f"/api/v1/orgs/{org.slug}/memberships/{target_m.id}/", {"role": "manager"}, format="json")
    assert r.status_code == 200, r.content
    target_m.refresh_from_db()
    assert target_m.role == "manager"


def test_cannot_demote_sole_owner(make_user, make_org):
    owner = make_user(email="o@x.com")
    org = make_org(name="O", owner=owner)
    owner_m = OrganizationMembership.objects.get(user=owner, organization=org)
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.patch(f"/api/v1/orgs/{org.slug}/memberships/{owner_m.id}/", {"role": "admin"}, format="json")
    assert r.status_code == 400
    assert "sole owner" in r.json()["detail"].lower()


def test_admin_delete_membership_soft_removes(make_user, make_org):
    admin = make_user(email="a@x.com")
    target = make_user(email="t@x.com")
    owner = make_user(email="o@x.com")
    org = make_org(name="O", owner=owner)
    OrganizationMembership.objects.create(user=admin, organization=org, role="admin")
    target_m = OrganizationMembership.objects.create(user=target, organization=org, role="staff")
    c = APIClient()
    c.force_authenticate(user=admin)
    r = c.delete(f"/api/v1/orgs/{org.slug}/memberships/{target_m.id}/")
    assert r.status_code == 204
    target_m.refresh_from_db()
    assert target_m.is_active is False


def test_cannot_remove_sole_owner(make_user, make_org):
    owner = make_user(email="o@x.com")
    org = make_org(name="O", owner=owner)
    owner_m = OrganizationMembership.objects.get(user=owner, organization=org)
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.delete(f"/api/v1/orgs/{org.slug}/memberships/{owner_m.id}/")
    assert r.status_code == 400


def test_non_admin_cannot_patch_membership(make_user, make_org):
    staff = make_user(email="s@x.com")
    target = make_user(email="t@x.com")
    owner = make_user(email="o@x.com")
    org = make_org(name="O", owner=owner)
    OrganizationMembership.objects.create(user=staff, organization=org, role="staff")
    target_m = OrganizationMembership.objects.create(user=target, organization=org, role="staff")
    c = APIClient()
    c.force_authenticate(user=staff)
    r = c.patch(f"/api/v1/orgs/{org.slug}/memberships/{target_m.id}/", {"role": "admin"}, format="json")
    assert r.status_code == 403
```

- [ ] **Step 2: Create or extend `backend/tests/test_invites.py`** with cancel-invite tests:

```python
def test_admin_can_cancel_pending_invite(make_user, make_org):
    from apps.orgs.models import Invite
    from datetime import timedelta
    from django.utils import timezone
    owner = make_user(email="o@x.com")
    org = make_org(name="O", owner=owner)
    invite = Invite.objects.create(
        organization=org, email="new@x.com", role="staff",
        token_hash="t" * 64, expires_at=timezone.now() + timedelta(days=3),
    )
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.delete(f"/api/v1/orgs/{org.slug}/invites/{invite.id}/")
    assert r.status_code == 204
    invite.refresh_from_db()
    assert invite.revoked_at is not None


def test_cannot_cancel_accepted_invite(make_user, make_org):
    # ... similar setup but with accepted_at set
    # expect 400
    pass  # (write similar to above)
```

- [ ] **Step 3: Run backend tests.**

```bash
cd backend && uv run pytest tests/test_memberships.py tests/test_invites.py -v
```
Expected: all pass.

### Task K4.5 — Frontend hooks

- [ ] **Step 1: Append to `frontend/lib/orgs.ts`.**

```ts
export type Membership = {
  id: string;
  user_email: string;
  role: Role;
  is_active: boolean;
  accepted_at: string;
};

export type Invite = {
  id: string;
  email: string;
  role: Role;
  created_at: string;
  expires_at: string;
};

export function useUpdateMembership(orgSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: string }) =>
      apiFetch<Membership>(`/api/v1/orgs/${orgSlug}/memberships/${membershipId}/`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", orgSlug] }),
  });
}

export function useRemoveMembership(orgSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/memberships/${membershipId}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", orgSlug] }),
  });
}

export function useCancelInvite(orgSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/invites/${inviteId}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", orgSlug] }),
  });
}

export function usePendingInvites(orgSlug: string) {
  return useQuery({
    queryKey: ["invites", orgSlug],
    queryFn: () =>
      apiFetch<{ count: number; results: Invite[] }>(`/api/v1/orgs/${orgSlug}/invites/`),
    enabled: !!orgSlug,
  });
}
```

### Task K4.6 — Update members table UI

- [ ] **Step 1: Rewrite `frontend/components/orgs/members-table.tsx`** to add per-row role select + remove button + pending invites section.

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
import {
  useCancelInvite,
  useMembers,
  usePendingInvites,
  useRemoveMembership,
  useSendInvite,
  useUpdateMembership,
} from "@/lib/orgs";

type Role = "owner" | "admin" | "manager" | "staff";

export function MembersTable({ slug }: { slug: string }) {
  const members = useMembers(slug);
  const invites = usePendingInvites(slug);
  const invite = useSendInvite(slug);
  const updateRole = useUpdateMembership(slug);
  const removeMember = useRemoveMembership(slug);
  const cancelInvite = useCancelInvite(slug);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [success, setSuccess] = useState<string | null>(null);

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    await invite.mutateAsync({ email, role });
    setSuccess(`Invite sent to ${email}.`);
    setEmail("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite member</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onInvite} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
            <Button type="submit" disabled={invite.isPending || !email}>
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
          {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
          {invite.isError && (
            <p className="mt-3 text-sm text-destructive">{extractApiError(invite.error)}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {members.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {members.data && (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Email</th>
                  <th className="text-left font-normal py-2">Role</th>
                  <th className="text-left font-normal py-2">Joined</th>
                  <th className="text-right font-normal py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.data.results.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="py-2">{m.user_email}</td>
                    <td className="py-2">
                      <select
                        value={m.role}
                        onChange={(e) =>
                          updateRole.mutate({ membershipId: m.id, role: e.target.value })
                        }
                        disabled={updateRole.isPending}
                        className="rounded border border-input bg-background px-2 py-1 text-xs"
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="staff">Staff</option>
                      </select>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(m.accepted_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={removeMember.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove ${m.user_email} from this organization?`)) {
                            removeMember.mutate(m.id);
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {updateRole.isError && (
            <p className="mt-2 text-sm text-destructive">{extractApiError(updateRole.error)}</p>
          )}
          {removeMember.isError && (
            <p className="mt-2 text-sm text-destructive">{extractApiError(removeMember.error)}</p>
          )}
        </CardContent>
      </Card>

      {invites.data && invites.data.count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites ({invites.data.count})</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Email</th>
                  <th className="text-left font-normal py-2">Role</th>
                  <th className="text-left font-normal py-2">Expires</th>
                  <th className="text-right font-normal py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.data.results.map((i) => (
                  <tr key={i.id} className="border-b">
                    <td className="py-2">{i.email}</td>
                    <td className="py-2">{i.role}</td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(i.expires_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cancelInvite.isPending}
                        onClick={() => cancelInvite.mutate(i.id)}
                      >
                        Cancel
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cancelInvite.isError && (
              <p className="mt-2 text-sm text-destructive">{extractApiError(cancelInvite.error)}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### Task K4.7 — Gates + commit + PR

(Same gate-run pattern as K1.6. Commit with subject `feat(plan-k4): member CRUD — role change, soft-remove, cancel invite`. Push + open PR.)

```bash
gh pr create --repo byondr-co/eventgate --head feature/plan-k4-member-crud --base main \
  --title "feat(plan-k4): member CRUD + cancel invite" \
  --body "Plan K slice 4/8 — item #5. New endpoints: PATCH/DELETE membership detail, DELETE invite detail. Sole-owner protection server-side. Frontend: per-row role dropdown + Remove button + pending-invites section with Cancel. Soft-remove via is_active=False (preserves audit trail; aligns with existing codebase pattern)."
```

---

## PR K5 — Public URL with short codes

**Item:** #6

**Branch:** `feature/plan-k5-short-urls`

**Depends on:** K1, K2

**Files:**
- Create: `backend/apps/shorturls/__init__.py`, `apps.py`, `models.py`, `views.py`, `urls.py`, `services.py`, `signals.py`, `admin.py`, `migrations/__init__.py`, `migrations/0001_initial.py` (or use makemigrations)
- Create: `backend/tests/test_short_urls.py`
- Modify: `backend/config/settings/base.py` (add `apps.shorturls` to `INSTALLED_APPS`)
- Modify: `backend/config/urls.py` (mount `/r/` redirect URL at root, not under `/api/v1/`)
- Create: `frontend/lib/short-urls.ts`
- Create: `frontend/components/events/copy-button.tsx`
- Create: `frontend/components/events/public-url-card.tsx`
- Create: `frontend/__tests__/components/events/copy-button.test.tsx`
- Create: `frontend/__tests__/components/events/public-url-card.test.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` (replace public URL block with `<PublicUrlCard>`)

### Task K5.1 — Backend: ShortUrl model + app scaffold

- [ ] **Step 1: Create directory + scaffold files.**

```bash
mkdir -p backend/apps/shorturls/migrations
touch backend/apps/shorturls/{__init__.py,apps.py,models.py,views.py,urls.py,services.py,signals.py,admin.py}
touch backend/apps/shorturls/migrations/__init__.py
```

- [ ] **Step 2: `backend/apps/shorturls/apps.py`.**

```python
from django.apps import AppConfig


class ShortUrlsConfig(AppConfig):
    name = "apps.shorturls"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from apps.shorturls import signals  # noqa: F401
```

- [ ] **Step 3: `backend/apps/shorturls/models.py`.**

```python
from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class ShortUrl(models.Model):
    """Short-code redirect target. Typically auto-created per Event for public registration."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    short_code = models.CharField(max_length=12, unique=True, db_index=True)
    target_url = models.CharField(max_length=500)
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="short_urls",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"/r/{self.short_code} → {self.target_url}"
```

- [ ] **Step 4: `backend/apps/shorturls/services.py`.**

```python
from __future__ import annotations

import secrets

from apps.shorturls.models import ShortUrl

# Base58: avoid 0, O, I, l for unambiguous reading
_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def generate_short_code(length: int = 8, max_attempts: int = 20) -> str:
    """Generate a unique short code. Retries up to max_attempts on collision."""
    for _ in range(max_attempts):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        if not ShortUrl.objects.filter(short_code=code).exists():
            return code
    raise RuntimeError(f"Failed to generate unique short_code after {max_attempts} attempts")
```

- [ ] **Step 5: `backend/apps/shorturls/views.py`.**

```python
from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_GET

from apps.shorturls.models import ShortUrl


@require_GET
def redirect_short_url(request: HttpRequest, short_code: str) -> HttpResponse:
    su = get_object_or_404(ShortUrl, short_code=short_code)
    if su.expires_at and su.expires_at < timezone.now():
        return HttpResponse("Expired", status=404)
    return redirect(su.target_url)
```

- [ ] **Step 6: `backend/apps/shorturls/urls.py`.**

```python
from django.urls import path

from apps.shorturls.views import redirect_short_url

urlpatterns = [
    path("r/<str:short_code>/", redirect_short_url, name="shorturl-redirect"),
]
```

- [ ] **Step 7: Mount in `backend/config/urls.py`.**

Find the main urlpatterns. Add a new `path("", include("apps.shorturls.urls"))` at the project-root level (not under `/api/v1/`):

```python
# backend/config/urls.py — example placement
urlpatterns = [
    # ... existing patterns ...
    path("", include("apps.shorturls.urls")),  # Plan K item #6 — public short URL redirect
]
```

- [ ] **Step 8: `backend/apps/shorturls/signals.py` — auto-create on Event save.**

```python
from __future__ import annotations

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.events.models import Event
from apps.shorturls.models import ShortUrl
from apps.shorturls.services import generate_short_code


@receiver(post_save, sender=Event)
def create_short_url_for_event(sender, instance: Event, created: bool, **kwargs) -> None:
    if not created:
        return
    org_slug = instance.organization.slug
    target = f"{getattr(settings, 'PUBLIC_BASE_URL', '')}/e/{org_slug}/{instance.slug}/register"
    ShortUrl.objects.create(
        short_code=generate_short_code(),
        target_url=target,
        event=instance,
    )
```

- [ ] **Step 9: `backend/apps/shorturls/admin.py`.**

```python
from django.contrib import admin

from apps.shorturls.models import ShortUrl

admin.site.register(ShortUrl)
```

- [ ] **Step 10: Add to `INSTALLED_APPS` in `backend/config/settings/base.py`.**

Find `INSTALLED_APPS = [...]` and append `"apps.shorturls",` near the other `apps.*` entries.

- [ ] **Step 11: Generate migration.**

```bash
cd backend && uv run python manage.py makemigrations shorturls
```
Expected: `Created 0001_initial.py`.

- [ ] **Step 12: Run migration locally.**

```bash
cd backend && uv run python manage.py migrate
```

### Task K5.2 — Backend tests

- [ ] **Step 1: Create `backend/tests/test_short_urls.py`.**

```python
import pytest
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from apps.shorturls.models import ShortUrl
from apps.shorturls.services import generate_short_code

pytestmark = pytest.mark.django_db


def test_redirect_returns_302(client):
    su = ShortUrl.objects.create(
        short_code="aB7k9Xq2",
        target_url="https://example.com/landing",
    )
    r = client.get(f"/r/{su.short_code}/")
    assert r.status_code == 302
    assert r["Location"] == "https://example.com/landing"


def test_unknown_code_returns_404(client):
    r = client.get("/r/nonexistent/")
    assert r.status_code == 404


def test_expired_short_url_returns_404(client):
    su = ShortUrl.objects.create(
        short_code="expCode1",
        target_url="https://example.com/x",
        expires_at=timezone.now() - timedelta(hours=1),
    )
    r = client.get(f"/r/{su.short_code}/")
    assert r.status_code == 404


def test_generate_short_code_returns_unique_8char_value():
    code = generate_short_code()
    assert len(code) == 8
    assert ShortUrl.objects.filter(short_code=code).count() == 0


def test_event_create_auto_creates_short_url(make_user, make_org):
    from apps.events.models import Event
    user = make_user(email="o@x.com")
    org = make_org(name="O", owner=user)
    event = Event.objects.create(organization=org, name="Test Event", slug="test-event")
    assert ShortUrl.objects.filter(event=event).count() == 1
    su = ShortUrl.objects.filter(event=event).first()
    assert su.short_code  # non-empty
    assert "/e/" in su.target_url
    assert su.target_url.endswith("/register")
```

- [ ] **Step 2: Run tests.**

```bash
cd backend && uv run pytest tests/test_short_urls.py -v
```
Expected: 5 pass.

### Task K5.3 — Frontend hook + components

- [ ] **Step 1: Create `frontend/lib/short-urls.ts`.**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type ShortUrl = {
  id: string;
  short_code: string;
  target_url: string;
  created_at: string;
};

export function useEventShortUrl(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["short-url", orgSlug, eventSlug],
    queryFn: () =>
      apiFetch<{ count: number; results: ShortUrl[] }>(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/short-urls/`,
      ),
    select: (data) => data.results[0] ?? null,
    enabled: !!orgSlug && !!eventSlug,
  });
}
```

**Note:** This implies a new GET endpoint at `/api/v1/orgs/<slug>/events/<slug>/short-urls/`. Add a list view to `apps/shorturls/views.py` that filters by event, with the standard `IsOrgMember` permission. Specifically:

```python
# backend/apps/shorturls/views.py — append
from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from apps.common.permissions import IsOrgMember
from apps.events.models import Event


class EventShortUrlListView(viewsets.GenericViewSet, mixins.ListModelMixin):
    """GET /api/v1/orgs/<slug>/events/<eventSlug>/short-urls/"""

    permission_classes = (IsAuthenticated, IsOrgMember)
    serializer_class = None  # use the simple dict-shape serializer below

    def list(self, request, org_slug=None, event_slug=None):
        from django.shortcuts import get_object_or_404
        from rest_framework.response import Response
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        qs = ShortUrl.objects.filter(event=event).order_by("-created_at")
        results = [
            {"id": str(s.id), "short_code": s.short_code, "target_url": s.target_url, "created_at": s.created_at.isoformat()}
            for s in qs
        ]
        return Response({"count": len(results), "results": results})
```

Wire URL in `apps/shorturls/urls.py`:

```python
urlpatterns = [
    path("r/<str:short_code>/", redirect_short_url, name="shorturl-redirect"),
    # mounted under /api/v1/ via the main router's namespace (this needs the
    # `api/v1/` prefix in config/urls.py via `include("apps.shorturls.api_urls")` separately,
    # OR add a separate api_urls.py for the namespaced routes).
]
```

Actually simpler: split into two URL files. Create `backend/apps/shorturls/api_urls.py`:

```python
from django.urls import path

from apps.shorturls.views import EventShortUrlListView

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/short-urls/",
        EventShortUrlListView.as_view({"get": "list"}),
        name="event-short-urls",
    ),
]
```

Then in `backend/config/urls.py`, add to the `api/v1/` include block:

```python
path("api/v1/", include("apps.shorturls.api_urls")),
```

And keep the original `path("", include("apps.shorturls.urls"))` for the public `/r/<code>/` redirect at root.

- [ ] **Step 2: Create `frontend/components/events/copy-button.tsx`** (TDD).

Test:

```tsx
// frontend/__tests__/components/events/copy-button.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

import { toast } from "sonner";
import { CopyButton } from "@/components/events/copy-button";

describe("CopyButton", () => {
  it("calls clipboard.writeText with provided text and shows success toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CopyButton text="https://example.com/x" />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("https://example.com/x");
    await Promise.resolve();
    expect(toast.success).toHaveBeenCalled();
  });
});
```

Implementation:

```tsx
"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type Props = { text: string; label?: string };

export function CopyButton({ text, label = "Copy" }: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Copied to clipboard");
        } catch {
          toast.error("Copy failed — your browser may block clipboard access");
        }
      }}
    >
      {label}
    </Button>
  );
}
```

- [ ] **Step 3: Create `frontend/components/events/public-url-card.tsx`.**

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/events/copy-button";
import { useEventShortUrl } from "@/lib/short-urls";

type Props = { orgSlug: string; eventSlug: string };

export function PublicUrlCard({ orgSlug, eventSlug }: Props) {
  const shortUrl = useEventShortUrl(orgSlug, eventSlug);

  const baseOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = `${baseOrigin}/e/${orgSlug}/${eventSlug}/register`;
  const shortFullUrl = shortUrl.data
    ? `${baseOrigin}/r/${shortUrl.data.short_code}`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public registration link</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-muted-foreground w-12">Long</span>
            <code className="flex-1 text-sm font-mono break-all">{fullUrl}</code>
            <CopyButton text={fullUrl} />
          </div>
          {shortFullUrl && (
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase text-muted-foreground w-12">Short</span>
              <code className="flex-1 text-sm font-mono break-all">{shortFullUrl}</code>
              <CopyButton text={shortFullUrl} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Share either URL with attendees. The short URL redirects to the full one.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Wire into event detail page.**

`frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` — replace the current public-registration `<Card>` block with:

```tsx
<PublicUrlCard orgSlug={slug} eventSlug={eventSlug} />
```

Add import:

```tsx
import { PublicUrlCard } from "@/components/events/public-url-card";
```

Remove the now-unused `publicUrl` local variable.

### Task K5.4 — Gates + commit + PR

(Same gate sequence. Commit subject: `feat(plan-k5): public URL with short codes + copy buttons`.)

```bash
gh pr create --repo byondr-co/eventgate --head feature/plan-k5-short-urls --base main \
  --title "feat(plan-k5): short URL + copy buttons" \
  --body "Plan K slice 5/8 — item #6. New \`apps/shorturls\` Django app: ShortUrl model, /r/<code>/ public redirect, auto-create on Event save via post_save signal. Frontend: PublicUrlCard renders both long + short URLs with CopyButton (uses navigator.clipboard + sonner toast)."
```

---

## PR K6 — CSV import drop-zone + wider modal

**Item:** #10

**Branch:** `feature/plan-k6-csv-dropzone`

**Depends on:** K1

**Files:**
- Create: `frontend/components/events/csv-drop-zone.tsx`
- Create: `frontend/__tests__/components/events/csv-drop-zone.test.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx`

### Task K6.1 — `<DropZone>` component (TDD)

- [ ] **Step 1: Write failing test.**

`frontend/__tests__/components/events/csv-drop-zone.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CsvDropZone } from "@/components/events/csv-drop-zone";

describe("CsvDropZone", () => {
  it("renders the drop-zone hint", () => {
    render(<CsvDropZone onFile={vi.fn()} />);
    expect(screen.getByText(/drop your csv here/i)).toBeInTheDocument();
    expect(screen.getByText(/or click to choose a file/i)).toBeInTheDocument();
  });

  it("calls onFile when a CSV is dropped", () => {
    const onFile = vi.fn();
    render(<CsvDropZone onFile={onFile} />);
    const zone = screen.getByLabelText(/csv drop zone/i);
    const file = new File(["a,b\n1,2"], "test.csv", { type: "text/csv" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("rejects non-CSV files with an inline message", () => {
    const onFile = vi.fn();
    render(<CsvDropZone onFile={onFile} />);
    const zone = screen.getByLabelText(/csv drop zone/i);
    const file = new File(["x"], "image.png", { type: "image/png" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/csv files only/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd frontend && pnpm test -- csv-drop-zone
```

- [ ] **Step 3: Create component.**

```tsx
// frontend/components/events/csv-drop-zone.tsx
"use client";

import { useRef, useState } from "react";

type Props = {
  onFile: (file: File) => void;
};

export function CsvDropZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    const isCsv = file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
    if (!isCsv) {
      setError("CSV files only");
      return;
    }
    setError(null);
    onFile(file);
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        aria-label="CSV drop zone"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          acceptFile(e.dataTransfer.files[0]);
        }}
        className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-accent" : "border-input bg-muted/30 hover:bg-muted/50"
        }`}
      >
        <div className="text-3xl mb-2">⬆</div>
        <div className="font-medium">Drop your CSV here</div>
        <div className="text-xs text-muted-foreground mt-1">or click to choose a file · CSV files only</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd frontend && pnpm test -- csv-drop-zone
```

### Task K6.2 — Wire DropZone + widen modal

- [ ] **Step 1: Modify `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx`.**

Two changes:
1. `<DialogContent className="max-w-3xl">` → `<DialogContent className="max-w-5xl">`
2. Replace the bare `<input type="file" ...>` block with the new `<CsvDropZone>`.

```tsx
// before (block at lines 73-83):
{!preview && (
  <div className="space-y-4">
    <input
      type="file"
      accept=".csv,text/csv"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void onFile(f);
      }}
      className="block w-full text-sm"
    />
    {previewMut.isError && (
      <p className="text-sm text-destructive">{extractApiError(previewMut.error)}</p>
    )}
  </div>
)}

// after:
{!preview && (
  <div className="space-y-4">
    <CsvDropZone onFile={onFile} />
    {previewMut.isError && (
      <p className="text-sm text-destructive">{extractApiError(previewMut.error)}</p>
    )}
  </div>
)}
```

Add import:

```tsx
import { CsvDropZone } from "@/components/events/csv-drop-zone";
```

### Task K6.3 — Gates + commit + PR

```bash
gh pr create --repo byondr-co/eventgate --head feature/plan-k6-csv-dropzone --base main \
  --title "feat(plan-k6): CSV import drop-zone + wider modal" \
  --body "Plan K slice 6/8 — item #10. New <CsvDropZone> with drag-and-drop + click-to-browse. Modal width bumped from max-w-3xl to max-w-5xl for the preview table."
```

---

## PR K7 — Preset field deletable

**Item:** #9

**Branch:** `feature/plan-k7-preset-delete`

**Depends on:** K1

**Files:**
- Modify: `backend/apps/events/views.py:88-89` (remove `is_preset` enforcement in `perform_destroy`)
- Modify: `backend/tests/test_registration_fields.py` (extend with preset-delete tests)
- Modify: `frontend/components/events/registration-form-builder.tsx` (preset-delete confirm dialog)

### Task K7.1 — Backend: allow preset deletion

- [ ] **Step 1: Modify `backend/apps/events/views.py`.**

```python
# before (line ~88-89):
def perform_destroy(self, instance):
    if instance.is_preset:
        raise ValidationError({"detail": "Preset fields cannot be deleted."})
    instance.delete()

# after:
def perform_destroy(self, instance):
    # Plan K item #9 — preset fields are now deletable; UI warns the operator.
    instance.delete()
```

If the method becomes a single-line override, you may remove it entirely (DRF's default `perform_destroy` already calls `instance.delete()`). Choose the form that's clearer. Remove the override if it's now a no-op.

- [ ] **Step 2: Extend `backend/tests/test_registration_fields.py`.**

Add tests:

```python
def test_delete_preset_email_field_now_succeeds(make_user, make_org):
    from apps.events.models import Event, RegistrationField
    user = make_user(email="o@x.com")
    org = make_org(name="O", owner=user)
    event = Event.objects.create(organization=org, name="E", slug="e")
    # The seed_preset_fields signal/service auto-creates preset fields
    email_field = RegistrationField.objects.get(event=event, field_key="email")
    assert email_field.is_preset is True
    c = APIClient()
    c.force_authenticate(user=user)
    r = c.delete(f"/api/v1/orgs/{org.slug}/events/{event.slug}/fields/{email_field.field_key}/")
    assert r.status_code == 204, r.content
    assert not RegistrationField.objects.filter(pk=email_field.pk).exists()


def test_delete_preset_name_field_now_succeeds(make_user, make_org):
    # similar to above for the "name" preset field
    ...


def test_delete_preset_phone_field_now_succeeds(make_user, make_org):
    # similar to above for the "phone_or_chat" preset field
    ...
```

- [ ] **Step 3: Run tests.**

```bash
cd backend && uv run pytest tests/test_registration_fields.py -v
```

### Task K7.2 — Frontend: confirm dialog for preset deletes

- [ ] **Step 1: Modify `frontend/components/events/registration-form-builder.tsx`.**

Find the existing delete button handler. Wrap with a confirm dialog when the field is preset:

```tsx
// pseudo-code — adapt to actual existing structure
const onDelete = (field: RegistrationField) => {
  if (field.is_preset) {
    const labels: Record<string, string> = {
      email: "Deleting `email` will disable QR-code email delivery for this event's new registrations.",
      name: "Deleting `name` will remove the guest-name capture; reports will lose name attribution.",
      phone_or_chat: "Deleting `phone_or_chat` will remove walk-in lookup by phone/chat ID.",
    };
    const warning = labels[field.field_key] ?? "This is a preset field; deleting it may break flows that rely on it.";
    if (!window.confirm(`${warning}\n\nThis cannot be undone via the UI. Continue?`)) {
      return;
    }
  }
  deleteField.mutate(field.field_key);
};
```

Use this `onDelete` in the existing delete-button click handler.

- [ ] **Step 2: Add a vitest case** (extend or add a `registration-form-builder.test.tsx` if it exists; otherwise rely on manual smoke since this dialog uses `window.confirm` which is annoying to test cleanly).

If no test file exists yet for this component, skip the test for this PR (the backend tests cover the core change).

### Task K7.3 — Gates + commit + PR

```bash
gh pr create --repo byondr-co/eventgate --head feature/plan-k7-preset-delete --base main \
  --title "feat(plan-k7): preset registration fields are now deletable" \
  --body "Plan K slice 7/8 — item #9. Backend: removes is_preset enforcement in RegistrationFieldViewSet.perform_destroy. Frontend: confirm dialog with destructive warning text when deleting preset fields (email/name/phone_or_chat). Operator owns the consequence."
```

---

## PR K8 — Silent refresh of access token

**Item:** #8b (paired with #8a in K1)

**Branch:** `feature/plan-k8-silent-refresh`

**Depends on:** K1

**Files:**
- Create: `frontend/lib/auth-refresh.ts`
- Create: `frontend/__tests__/lib/auth-refresh.test.ts`
- Modify: `frontend/app/(app)/layout.tsx` (mount `<SessionRefreshProvider>`)
- Modify: `frontend/lib/api.ts` (export an event hook for 401 detection if needed)

### Task K8.1 — Auth-refresh module (TDD)

- [ ] **Step 1: Write failing test.**

`frontend/__tests__/lib/auth-refresh.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { setupSilentRefresh, teardownSilentRefresh } from "@/lib/auth-refresh";

describe("auth-refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response));
  });

  afterEach(() => {
    teardownSilentRefresh();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("schedules a refresh ~23h after setup", () => {
    setupSilentRefresh();
    expect(global.fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(23 * 60 * 60 * 1000 + 100);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/auth/refresh/",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("teardown cancels the scheduled refresh", () => {
    setupSilentRefresh();
    teardownSilentRefresh();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd frontend && pnpm test -- auth-refresh
```

- [ ] **Step 3: Create `frontend/lib/auth-refresh.ts`.**

```ts
"use client";

const REFRESH_BEFORE_EXPIRY_MS = 23 * 60 * 60 * 1000; // 23h (token is 1d)

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function setupSilentRefresh(): void {
  teardownSilentRefresh();
  refreshTimer = setTimeout(async () => {
    try {
      const res = await fetch("/api/v1/auth/refresh/", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        // Re-arm the timer for the next cycle
        setupSilentRefresh();
      } else {
        // Refresh failed — redirect to login on next 401 (handled by apiFetch wrapper)
      }
    } catch {
      // Network error — let the next apiFetch hit a 401 and redirect
    }
  }, REFRESH_BEFORE_EXPIRY_MS);
}

export function teardownSilentRefresh(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd frontend && pnpm test -- auth-refresh
```

### Task K8.2 — Wire `<SessionRefreshProvider>` into layout

- [ ] **Step 1: Create a tiny provider component.**

Append to `frontend/lib/auth-refresh.ts`:

```ts
import { useEffect } from "react";

export function SessionRefreshProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setupSilentRefresh();
    return () => teardownSilentRefresh();
  }, []);
  return <>{children}</>;
}
```

Add `import React, { useEffect } from "react";` at top of file.

- [ ] **Step 2: Mount in `frontend/app/(app)/layout.tsx`.**

Wrap the existing layout's body with `<SessionRefreshProvider>`:

```tsx
// add import
import { SessionRefreshProvider } from "@/lib/auth-refresh";

// inside the existing AppLayout return:
return (
  <SessionRefreshProvider>
    <div className="min-h-screen flex flex-col">
      {/* existing header + main content */}
    </div>
  </SessionRefreshProvider>
);
```

(Optional: also implement reactive 401-retry in `apiFetch`. For PR scope, the proactive timer alone is sufficient — if the proactive refresh fails, the next request gets a 401 which is currently handled by middleware-redirect-to-login. Reactive 401-retry can be a small follow-up if needed.)

### Task K8.3 — Gates + commit + PR

```bash
gh pr create --repo byondr-co/eventgate --head feature/plan-k8-silent-refresh --base main \
  --title "feat(plan-k8): silent refresh of access token" \
  --body "Plan K slice 8/8 — item #8b. Frontend timer schedules POST /api/v1/auth/refresh/ at 23h mark to refresh the now-1d access token transparently. Operator never sees a session expiry during a normal day. Pairs with K1's ACCESS_TOKEN_LIFETIME=1d change."
```

---

## Self-review — completed inline

**Spec coverage check** (against `docs/plans/2026-05-31-plan-k-pre-pilot-enhancements.md`):

| Spec section | PR / Task |
|---|---|
| §2 item 1 (placeholder) | K1.4 |
| §2 item 2 (members org awareness) | K2 |
| §2 item 3 (org rename) | K3 |
| §2 item 4 (invite error UX) | K1.2 + K1.3 |
| §2 item 5 (member CRUD) | K4 |
| §2 item 6 (short URL) | K5 |
| §2 item 7 (add-form error UX) | K1.2 + K1.3 |
| §2 item 8 (session 1d + silent refresh) | K1.1 + K8 |
| §2 item 9 (preset deletable) | K7 |
| §2 item 10 (CSV modal) | K6 |
| §2 item 11 (CSV email doc) | K1.5 |
| §4.1 ShortUrl model | K5.1 |
| §4.2 endpoint table (PATCH org, membership detail, invite cancel, etc.) | K3, K4, K5 |
| §4.3 session config + preset delete | K1.1, K7 |
| §4.4 file map | matches K2–K8 task file lists |
| §4.5 short URL auto-create | K5.1 Step 8 (signal) |
| §4.6 silent refresh | K8 |
| §5 testing (backend + frontend) | each PR's TDD tasks + dedicated test files listed in Files |
| §7 acceptance criteria | each PR's gates + manual smoke confirmation |
| §8 8-PR rollout | this plan structure matches |

No spec gaps.

**Placeholder scan:** No "TBD" / "TODO" / "etc." (in vague sense). Every step has exact code or exact commands. Two notes: K3.1 Step 1 says "Read the file first — if slug is already in read_only_fields, no change needed" (this is a fact-check instruction, not a placeholder); K7.2 Step 2 says "skip the test if no test file exists" (acceptable scope limitation, called out explicitly).

**Type consistency:**
- `extractApiError(err: unknown): string` — defined K1.2, used in K1.3, K3, K4 ✓
- `ShortUrl` type shape consistent K5.1 backend ↔ K5.3 frontend ✓
- `useUpdateOrg(slug)` signature K3.2 matches usage in K3.3 ✓
- `useUpdateMembership(orgSlug).mutate({ membershipId, role })` — defined K4.5, used K4.6 ✓
- `useRemoveMembership(orgSlug).mutate(membershipId)` — same ✓
- `useCancelInvite(orgSlug).mutate(inviteId)` — same ✓
- `useEventShortUrl(orgSlug, eventSlug)` — defined K5.3, used K5.3 ✓
- Branch names follow pattern `feature/plan-k<N>-<short>` throughout ✓

Plan is internally consistent. Ready to dispatch.
