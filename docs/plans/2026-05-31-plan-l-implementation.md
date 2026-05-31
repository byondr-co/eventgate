# Plan L Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Plan L has 8 PR slices (L1–L8). Dispatch one agent per PR slice; each agent runs in its own isolated worktree, opens one PR, then stops.

**Goal:** Ship 8 small PRs covering the remaining early-pilot feedback: duplicate-breadcrumb fix, members cache-refresh fix, a reusable confirm dialog, prod backend auto-deploy, guest search + per-guest QR resend actions, transfer-ownership, Tigris object storage, a registration banner + description, and a per-event short-link management tab.

**Architecture:** Backend changes touch `apps/orgs/` (membership self-edit guard), `apps/guests/` (search param + QR resend endpoints), `apps/shorturls/` (model fields + create/PATCH + visit tracking + referral attribution), `apps/events/` (banner + description), plus storage config. Frontend adds a reusable `<ConfirmDialog>`, guest-table actions/search, members-table ownership flow, a banner/description editor, and a new "Links" tab.

**Tech Stack:** Django 5 + DRF + Celery + Postgres + Redis on Fly; Next.js 15 App Router + TanStack Query + shadcn-ui on Vercel; vitest + pytest; uv + pnpm.

**Spec:** [`docs/plans/2026-05-31-plan-l-pilot-feedback-fixes.md`](2026-05-31-plan-l-pilot-feedback-fixes.md) — commit `c387c87`.

---

## Universal pre-flight (every PR slice begins with these)

Every PR-slice agent runs these as Step 0 of its dispatch:

```bash
pwd   # MUST be under .claude/worktrees/agent-<id>/ — if not, STOP (banked lesson #4: worktree isolation can silently fail)
git fetch origin --quiet
git checkout -b feature/plan-l<N>-<short-name> origin/main
git log --oneline -1   # expect current main tip
cd backend && uv sync --frozen && cd ..
cd frontend && pnpm install --frozen-lockfile && cd ..
```

**Gates (run before every commit):**

```bash
cd backend && uv run pytest -x && uv run mypy apps config && uv run ruff check apps config && uv run ruff format --check apps config && cd ..
cd frontend && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit && pnpm test && cd ..
```

**Banked lessons (apply throughout):**
1. No `make_user`/`make_org` fixtures — define local `_make_user`/`_make_org` helpers (pattern below, from `backend/tests/test_short_urls.py`).
2. `tsconfig.target = es2017` — no `s` (dotAll) regex flag; use `[\s\S]+`.
3. `vi.mock("@/lib/api")` must export EVERY consumed binding (`apiFetch`, `extractApiError`, `API_BASE`).
4. Pre-commit hooks (ruff-format/prettier) may modify files — re-stage and commit as a NEW commit, never `--amend`.
5. Mirror the soft-delete pattern (`is_active`) — no hard deletes.
6. `frontend/AGENTS.md`: this is NOT the Next.js you know — `params` is a `Promise`; read `node_modules/next/dist/docs/` before TSX.
7. PR auth: `gh auth switch --hostname github.com --user vineidev` before `gh pr create --repo byondr-co/eventgate`.

**Backend test helper pattern (paste into each new backend test file):**

```python
from django.contrib.auth import get_user_model
from apps.orgs.models import Organization, OrganizationMembership

User = get_user_model()

def _make_user(email: str):
    return User.objects.create_user(email=email)

def _make_org(name: str, owner, role: str = "owner"):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role=role)
    return org
```

---

## PR L1 — Quick fixes: duplicate breadcrumb + members cache refresh

**Items:** L-bug-1, L-bug-3

**Branch:** `feature/plan-l1-quick-fixes`

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx`
- Modify: `frontend/lib/orgs.ts`
- Create: `frontend/__tests__/lib/orgs-invalidation.test.tsx`

### Task L1.1 — Remove the duplicate breadcrumb (bug-1)

- [ ] **Step 1: Edit `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx`.** Remove the `<BreadcrumbTrail />` line and its import; keep `<EventTabsNav />`. Result:

```tsx
import type { ReactNode } from "react";

import { EventTabsNav } from "@/components/nav/event-tabs-nav";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string; eventSlug: string }>;
};

export default async function EventLayout({ children, params }: Props) {
  const { slug, eventSlug } = await params;
  return (
    <div className="space-y-4">
      <EventTabsNav orgSlug={slug} eventSlug={eventSlug} />
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification note.** The parent org layout (`orgs/[slug]/layout.tsx`) still renders `<BreadcrumbTrail />`, so the breadcrumb shows exactly once inside the event subtree. No automated test (layout composition); verified visually during PR review.

### Task L1.2 — Fix members/invites query-key invalidation (bug-3)

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/lib/orgs-invalidation.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  extractApiError: (e: unknown) => (e instanceof Error ? e.message : "err"),
  API_BASE: "",
}));

import { apiFetch } from "@/lib/api";
import { useUpdateMembership, useRemoveMembership, useSendInvite } from "@/lib/orgs";

const mockApi = vi.mocked(apiFetch);
const SLUG = "acme";

function makeClientAndSpy() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, spy, wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe("orgs mutation cache invalidation", () => {
  it("useUpdateMembership invalidates the members query key used by useMembers", async () => {
    mockApi.mockResolvedValue({});
    const { spy, wrapper } = makeClientAndSpy();
    const { result } = renderHook(() => useUpdateMembership(SLUG), { wrapper });
    await result.current.mutateAsync({ membershipId: "m1", role: "manager" });
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: ["orgs", SLUG, "members"] }),
    );
  });

  it("useRemoveMembership invalidates the members query key", async () => {
    mockApi.mockResolvedValue(undefined);
    const { spy, wrapper } = makeClientAndSpy();
    const { result } = renderHook(() => useRemoveMembership(SLUG), { wrapper });
    await result.current.mutateAsync("m1");
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: ["orgs", SLUG, "members"] }),
    );
  });

  it("useSendInvite invalidates the pending-invites query key used by usePendingInvites", async () => {
    mockApi.mockResolvedValue({});
    const { spy, wrapper } = makeClientAndSpy();
    const { result } = renderHook(() => useSendInvite(SLUG), { wrapper });
    await result.current.mutateAsync({ email: "x@y.com", role: "staff" });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["invites", SLUG] }));
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd frontend && pnpm test -- orgs-invalidation
```
Expected: all three fail — current keys are `["members", orgSlug]` (mutations) and `["orgs", slug, "members"]` (send-invite), neither matching.

- [ ] **Step 3: Fix the keys in `frontend/lib/orgs.ts`.** Three edits:

`useUpdateMembership` `onSuccess`:
```ts
onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs", orgSlug, "members"] }),
```
`useRemoveMembership` `onSuccess`:
```ts
onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs", orgSlug, "members"] }),
```
`useSendInvite` `onSuccess` (was `["orgs", slug, "members"]` — should target invites):
```ts
onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", slug] }),
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd frontend && pnpm test -- orgs-invalidation
```
Expected: 3 pass.

### Task L1.3 — Gates + commit + PR

- [ ] **Step 1: Run all gates** (see Universal pre-flight).
- [ ] **Step 2: Commit.**

```bash
git add "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx" \
        frontend/lib/orgs.ts frontend/__tests__/lib/orgs-invalidation.test.tsx
git commit -m "fix(plan-l1): remove duplicate breadcrumb + align members/invites query-key invalidation"
```

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feature/plan-l1-quick-fixes
gh auth switch --hostname github.com --user vineidev
gh pr create --repo byondr-co/eventgate --head feature/plan-l1-quick-fixes --base main \
  --title "fix(plan-l1): duplicate breadcrumb + members cache refresh" \
  --body "$(cat <<'EOF'
## Summary
Plan L slice 1/8.
- **L-bug-1** Remove the second `<BreadcrumbTrail />` from the event layout; the parent org layout already renders it.
- **L-bug-3** Align react-query invalidation keys: `useUpdateMembership`/`useRemoveMembership` now invalidate `["orgs", slug, "members"]` (the key `useMembers` reads); `useSendInvite` invalidates `["invites", slug]`. Role change / remove / invite now refresh without a manual reload.

## Test plan
- [ ] CI green
- [ ] Manual: change a member role and remove a member — table updates without reload
EOF
)"
```

- [ ] **Step 4: Report PR URL; dispatcher merges.**

---

## PR L2 — Reusable ConfirmDialog (replaces window.confirm)

**Item:** L-bug-2

**Branch:** `feature/plan-l2-confirm-dialog`

**Depends on:** L1 merged.

**Files:**
- Create: `frontend/components/common/confirm-dialog.tsx`
- Create: `frontend/__tests__/components/common/confirm-dialog.test.tsx`
- Modify: `frontend/components/orgs/members-table.tsx`
- Modify: `frontend/components/events/registration-form-builder.tsx`

### Task L2.1 — ConfirmDialog component (TDD)

- [ ] **Step 1: Write the failing test.** Create `frontend/__tests__/components/common/confirm-dialog.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/common/confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders trigger and shows title/description when opened", () => {
    render(
      <ConfirmDialog
        trigger={<button>Remove</button>}
        title="Remove member?"
        description="This cannot be undone."
        confirmLabel="Remove"
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("Remove member?")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button>Delete</button>}
        title="Delete?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete", hidden: false }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd frontend && pnpm test -- confirm-dialog
```

- [ ] **Step 3: Create `frontend/components/common/confirm-dialog.tsx`.**

```tsx
"use client";

import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{cancelLabel}</Button>
          </DialogClose>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Note: confirm the `Button` component exposes a `destructive` variant (`grep -n "destructive" frontend/components/ui/button.tsx`). If not, use `className` with `bg-destructive text-destructive-foreground` instead.

- [ ] **Step 4: Run, expect PASS.**

```bash
cd frontend && pnpm test -- confirm-dialog
```

### Task L2.2 — Replace window.confirm in members-table

- [ ] **Step 1: Edit `frontend/components/orgs/members-table.tsx` (the Remove button, ~line 114-127).** Add import `import { ConfirmDialog } from "@/components/common/confirm-dialog";` and replace the `<Button … onClick={window.confirm…}>` with:

```tsx
<ConfirmDialog
  trigger={
    <Button variant="outline" size="sm" disabled={removeMember.isPending}>
      Remove
    </Button>
  }
  title="Remove member?"
  description={`Remove ${m.user_email} from this organization?`}
  confirmLabel="Remove"
  onConfirm={() => removeMember.mutate(m.id)}
/>
```

### Task L2.3 — Replace window.confirm in registration-form-builder

- [ ] **Step 1: Locate the call.** `grep -n "window.confirm" frontend/components/events/registration-form-builder.tsx` (~line 139). Read ~20 lines around it to see the delete handler and the button it guards.
- [ ] **Step 2: Wrap the delete control in `<ConfirmDialog>`.** Add the import, then replace the button that triggers the `window.confirm`-guarded delete with a `ConfirmDialog` whose `trigger` is that button and whose `onConfirm` calls the existing delete mutation directly (drop the `window.confirm` guard). Use:

```tsx
title="Delete this field?"
description="Guests will no longer be asked for this field. This cannot be undone."
confirmLabel="Delete field"
```

- [ ] **Step 3: Verify no `window.confirm` remains.**

```bash
grep -rn "window.confirm" frontend/components frontend/app
```
Expected: empty.

### Task L2.4 — Gates + commit + PR

- [ ] **Step 1: Gates.**
- [ ] **Step 2: Commit.**

```bash
git add frontend/components/common/confirm-dialog.tsx \
        frontend/__tests__/components/common/confirm-dialog.test.tsx \
        frontend/components/orgs/members-table.tsx \
        frontend/components/events/registration-form-builder.tsx
git commit -m "feat(plan-l2): reusable ConfirmDialog replaces window.confirm at delete sites"
```

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feature/plan-l2-confirm-dialog
gh auth switch --hostname github.com --user vineidev
gh pr create --repo byondr-co/eventgate --head feature/plan-l2-confirm-dialog --base main \
  --title "feat(plan-l2): ConfirmDialog" \
  --body "Plan L slice 2/8 — L-bug-2. New reusable \`<ConfirmDialog>\` (shadcn Dialog, destructive confirm). Replaces \`window.confirm\` in members-table (remove member) and registration-form-builder (delete field). Reused by L5 (make owner) and L8 (disable link)."
```

- [ ] **Step 4: Report PR URL; dispatcher merges.**

---

## PR L3 — Prod backend auto-deploy

**Item:** L-ops-1

**Branch:** `feature/plan-l3-prod-autodeploy`

**Depends on:** L1 merged (no code dependency; ordering only).

**Files:**
- Modify: `.github/workflows/deploy-backend-prod.yml`

### Task L3.1 — Add the push trigger

- [ ] **Step 1: Edit `.github/workflows/deploy-backend-prod.yml`.** Change the `on:` block from:

```yaml
on:
  workflow_dispatch:
  release:
    types: [published]
```
to:
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
  release:
    types: [published]
```

- [ ] **Step 2: Update the header comment.** The file's top comment says "Manual gate only — NOT auto-triggered on push". Replace that line with: `# Auto-deploys on push to main (CI gates run on the PR before merge). Also supports manual dispatch + release publish.`

- [ ] **Step 3: Validate YAML.**

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy-backend-prod.yml')); print('ok')"
```
Expected: `ok`.

### Task L3.2 — Commit + PR

- [ ] **Step 1: Commit.**

```bash
git add .github/workflows/deploy-backend-prod.yml
git commit -m "ci(plan-l3): auto-deploy prod backend on push to main"
```

- [ ] **Step 2: Push + PR.**

```bash
git push -u origin feature/plan-l3-prod-autodeploy
gh auth switch --hostname github.com --user vineidev
gh pr create --repo byondr-co/eventgate --head feature/plan-l3-prod-autodeploy --base main \
  --title "ci(plan-l3): prod backend auto-deploy on main" \
  --body "Plan L slice 3/8 — L-ops-1. Adds \`push: branches: [main]\` to the prod backend deploy workflow so prod no longer needs a manual flyctl deploy. The real safety gate (tests on PR before merge) already exists; the manual gate only added latency."
```

> **Dispatcher note:** after this merges, the first push to main triggers a prod deploy. Confirm `FLY_API_TOKEN_PROD` secret is present (per the workflow header) before merging.

- [ ] **Step 3: Report PR URL.**

---

## PR L4 — Guest search + per-guest QR resend actions

**Items:** L-feat-5 (search), L-feat-4 (Email QR + Copy Telegram link)

**Branch:** `feature/plan-l4-guest-actions`

**Depends on:** L1 merged.

**Files:**
- Modify: `backend/apps/guests/views.py` (search param; two new views)
- Modify: `backend/apps/guests/urls.py` (two routes)
- Create: `backend/tests/test_guest_search.py`
- Create: `backend/tests/test_guest_actions.py`
- Modify: `frontend/lib/guests.ts` (search arg + two hooks)
- Modify: `frontend/components/guests/guests-table.tsx` (search box + Actions column)

### Task L4.1 — Backend: guest search param (TDD)

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_guest_search.py`:

```python
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db
User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner, role: str = "owner"):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role=role)
    return org


def _setup():
    owner = _make_user("o@x.com")
    org = _make_org("Org", owner)
    event = Event.objects.create(organization=org, name="E", slug="e")
    Guest.objects.create(organization=org, event=event, entry_token="t1", full_name="Alice Smith", email="alice@x.com", phone_or_chat="012")
    Guest.objects.create(organization=org, event=event, entry_token="t2", full_name="Bob Jones", email="bob@y.com", phone_or_chat="099")
    client = APIClient()
    client.force_authenticate(user=owner)
    return client, org, event


def _url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/"


def test_search_matches_name():
    client, org, event = _setup()
    r = client.get(_url(org, event), {"search": "alice"})
    assert r.status_code == 200, r.content
    names = [g["full_name"] for g in r.json()["results"]]
    assert names == ["Alice Smith"]


def test_search_matches_email_case_insensitive():
    client, org, event = _setup()
    r = client.get(_url(org, event), {"search": "BOB@Y"})
    assert [g["full_name"] for g in r.json()["results"]] == ["Bob Jones"]


def test_search_matches_phone():
    client, org, event = _setup()
    r = client.get(_url(org, event), {"search": "099"})
    assert [g["full_name"] for g in r.json()["results"]] == ["Bob Jones"]


def test_no_search_returns_all():
    client, org, event = _setup()
    r = client.get(_url(org, event))
    assert r.json()["count"] == 2
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd backend && uv run pytest tests/test_guest_search.py -v
```

- [ ] **Step 3: Add the search filter to `GuestListView.get_queryset` in `backend/apps/guests/views.py`.** After the existing `entry_status` filter block, before `return qs`:

```python
from django.db.models import Q  # add to imports at top

# ...inside get_queryset, after entry_status filter:
search = self.request.query_params.get("search")
if search:
    qs = qs.filter(
        Q(full_name__icontains=search)
        | Q(email__icontains=search)
        | Q(phone_or_chat__icontains=search)
    )
return qs
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd backend && uv run pytest tests/test_guest_search.py -v
```
Expected: 4 pass.

### Task L4.2 — Backend: Email-QR + Telegram-link endpoints (TDD)

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_guest_actions.py`:

```python
from __future__ import annotations

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db
User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner, role: str = "owner"):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role=role)
    return org


def _setup(email="guest@x.com"):
    owner = _make_user("o@x.com")
    org = _make_org("Org", owner)
    event = Event.objects.create(organization=org, name="E", slug="e")
    guest = Guest.objects.create(
        organization=org, event=event, entry_token="tok123", full_name="G", email=email
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return client, org, event, guest


def test_send_qr_email_enqueues_task():
    client, org, event, guest = _setup()
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/send-qr-email/"
    with patch("apps.guests.views.send_qr_email_task.delay") as delay:
        r = client.post(url)
    assert r.status_code == 202, r.content
    delay.assert_called_once_with(guest_id=str(guest.id))


def test_send_qr_email_400_when_guest_has_no_email():
    client, org, event, guest = _setup(email="")
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/send-qr-email/"
    r = client.post(url)
    assert r.status_code == 400


def test_telegram_link_returns_deep_link(settings):
    settings.TELEGRAM_BOT_USERNAME = "eventgate_bot"
    client, org, event, guest = _setup()
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/telegram-link/"
    r = client.get(url)
    assert r.status_code == 200, r.content
    assert r.json()["url"] == "https://t.me/eventgate_bot?start=tok123"
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd backend && uv run pytest tests/test_guest_actions.py -v
```

- [ ] **Step 3: Add the two views to `backend/apps/guests/views.py`.** Add imports at top: `from django.conf import settings` and `from apps.guests.tasks import send_qr_email_task` (alongside the existing `process_csv_import_task` import). Append:

```python
class GuestSendQrEmailView(APIView):
    """POST /api/v1/orgs/<org>/events/<event>/guests/<id>/send-qr-email/"""

    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]

    def post(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = get_object_or_404(
            Guest, id=guest_id, organization=request.organization, event__slug=event_slug
        )
        if not guest.email:
            return Response(
                {"detail": "This guest has no email on file."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        send_qr_email_task.delay(guest_id=str(guest.id))
        return Response({"status": "queued"}, status=status.HTTP_202_ACCEPTED)


class GuestTelegramLinkView(APIView):
    """GET /api/v1/orgs/<org>/events/<event>/guests/<id>/telegram-link/

    Returns the bot deep link for staff to forward. Keeps entry_token out of the
    bulk guest list (GuestSerializer deliberately omits it)."""

    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]

    def get(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = get_object_or_404(
            Guest, id=guest_id, organization=request.organization, event__slug=event_slug
        )
        bot = getattr(settings, "TELEGRAM_BOT_USERNAME", "")
        if not bot:
            return Response(
                {"detail": "Telegram bot is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"url": f"https://t.me/{bot}?start={guest.entry_token}"})
```

- [ ] **Step 4: Wire routes in `backend/apps/guests/urls.py`.** Add imports `GuestSendQrEmailView, GuestTelegramLinkView` and two paths (before the `guests/<uuid:guest_id>/qr.png` line):

```python
path(
    "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/<uuid:guest_id>/send-qr-email/",
    GuestSendQrEmailView.as_view(),
    name="guest-send-qr-email",
),
path(
    "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/<uuid:guest_id>/telegram-link/",
    GuestTelegramLinkView.as_view(),
    name="guest-telegram-link",
),
```

- [ ] **Step 5: Run, expect PASS.**

```bash
cd backend && uv run pytest tests/test_guest_actions.py -v
```
Expected: 3 pass.

### Task L4.3 — Frontend: search arg + action hooks

- [ ] **Step 1: Update `useGuests` in `frontend/lib/guests.ts`** to accept an optional search term:

```ts
export function useGuests(orgSlug: string, eventSlug: string, search = "") {
  return useQuery({
    queryKey: ["guests", orgSlug, eventSlug, search],
    queryFn: () =>
      apiFetch<Paginated<Guest>>(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/` +
          (search ? `?search=${encodeURIComponent(search)}` : ""),
      ),
    enabled: !!orgSlug && !!eventSlug,
  });
}
```

- [ ] **Step 2: Append two hooks to `frontend/lib/guests.ts`.**

```ts
export function useSendQrEmail(orgSlug: string, eventSlug: string) {
  return useMutation({
    mutationFn: (guestId: string) =>
      apiFetch<{ status: string }>(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/send-qr-email/`,
        { method: "POST" },
      ),
  });
}

export function fetchTelegramLink(orgSlug: string, eventSlug: string, guestId: string) {
  return apiFetch<{ url: string }>(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/telegram-link/`,
  );
}
```

### Task L4.4 — Frontend: search box + Actions column

- [ ] **Step 1: Rewrite `frontend/components/guests/guests-table.tsx`** to add a search input (debounced via local state) and an Actions column with the two buttons:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
import { fetchTelegramLink, useGuests, useSendQrEmail } from "@/lib/guests";

export function GuestsTable({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const [search, setSearch] = useState("");
  const guests = useGuests(orgSlug, eventSlug, search);
  const sendQr = useSendQrEmail(orgSlug, eventSlug);
  const [notice, setNotice] = useState<string | null>(null);

  const onEmail = async (guestId: string) => {
    setNotice(null);
    try {
      await sendQr.mutateAsync(guestId);
      setNotice("QR email queued.");
    } catch (e) {
      setNotice(extractApiError(e));
    }
  };

  const onCopyTelegram = async (guestId: string) => {
    setNotice(null);
    try {
      const { url } = await fetchTelegramLink(orgSlug, eventSlug, guestId);
      await navigator.clipboard.writeText(url);
      setNotice("Telegram link copied.");
    } catch (e) {
      setNotice(extractApiError(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guests {guests.data && `(${guests.data.count})`}</CardTitle>
      </CardHeader>
      <CardContent>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, or phone…"
          className="mb-4 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {notice && <p className="mb-2 text-sm text-muted-foreground">{notice}</p>}
        {guests.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {guests.data && guests.data.results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {search ? "No matches." : "No registrations yet."}
          </p>
        )}
        {guests.data && guests.data.results.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="text-left font-normal py-2">Name</th>
                <th className="text-left font-normal py-2">Email</th>
                <th className="text-left font-normal py-2">Phone</th>
                <th className="text-left font-normal py-2">Entry</th>
                <th className="text-left font-normal py-2">Registered</th>
                <th className="text-right font-normal py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {guests.data.results.map((g) => (
                <tr key={g.id} className="border-b">
                  <td className="py-2">{g.full_name}</td>
                  <td className="py-2">{g.email}</td>
                  <td className="py-2">{g.phone_or_chat}</td>
                  <td className="py-2">{g.entry_status}</td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(g.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-right space-x-2 whitespace-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!g.email || sendQr.isPending}
                      onClick={() => onEmail(g.id)}
                    >
                      Email QR
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onCopyTelegram(g.id)}>
                      Copy Telegram link
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
```

Note: `useMutation` is already imported in `lib/guests.ts`; if not, add it to the `@tanstack/react-query` import.

### Task L4.5 — Gates + commit + PR

- [ ] **Step 1: Gates.**
- [ ] **Step 2: Commit.**

```bash
git add backend/apps/guests/views.py backend/apps/guests/urls.py \
        backend/tests/test_guest_search.py backend/tests/test_guest_actions.py \
        frontend/lib/guests.ts frontend/components/guests/guests-table.tsx
git commit -m "feat(plan-l4): guest search + per-row Email QR / Copy Telegram link actions"
```

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feature/plan-l4-guest-actions
gh auth switch --hostname github.com --user vineidev
gh pr create --repo byondr-co/eventgate --head feature/plan-l4-guest-actions --base main \
  --title "feat(plan-l4): guest search + QR resend actions" \
  --body "$(cat <<'EOF'
## Summary
Plan L slice 4/8 — L-feat-5 + L-feat-4.
- **Search** server-side `?search=` (icontains over name/email/phone) + search box above the guests table.
- **Email QR** per row → enqueues the existing `send_qr_email_task` (button disabled when the row has no email).
- **Copy Telegram link** per row → new endpoint returns `https://t.me/<bot>?start=<entry_token>`, copied to clipboard. Keeps `entry_token` out of the bulk list.

## Test plan
- [ ] CI green
- [ ] Manual: search filters rows; Email QR queues; Copy puts a valid t.me link on the clipboard
EOF
)"
```

- [ ] **Step 4: Report PR URL.**

---

## PR L5 — Transfer ownership + block self-role-change

**Item:** L-feat-6

**Branch:** `feature/plan-l5-transfer-ownership`

**Depends on:** L2 merged (uses `<ConfirmDialog>`).

**Files:**
- Modify: `backend/apps/orgs/views.py` (`OrgMembershipDetailView.partial_update` self-edit guard)
- Modify: `backend/tests/test_memberships.py` (add tests; create if absent)
- Modify: `frontend/components/orgs/members-table.tsx` (own-row guard, owner removed from dropdown, "Make owner" action)

### Task L5.1 — Backend: block self-role-change (TDD)

- [ ] **Step 1: Check for an existing test file.** `ls backend/tests/test_memberships.py` — if absent, create it with the `_make_user`/`_make_org` helpers from the pre-flight. Add these tests:

```python
def test_owner_cannot_change_own_role(client_unused=None):
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    co = _make_user("co@x.com")
    OrganizationMembership.objects.create(user=co, organization=org, role="owner")  # second owner so sole-owner guard isn't the blocker
    own_m = OrganizationMembership.objects.get(user=owner, organization=org)
    from rest_framework.test import APIClient
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.patch(f"/api/v1/orgs/{org.slug}/memberships/{own_m.id}/", {"role": "admin"}, format="json")
    assert r.status_code == 400, r.content
    assert "own role" in r.json()["detail"].lower()
    own_m.refresh_from_db()
    assert own_m.role == "owner"


def test_make_another_member_owner_succeeds():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    member = _make_user("m@x.com")
    m = OrganizationMembership.objects.create(user=member, organization=org, role="admin")
    from rest_framework.test import APIClient
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.patch(f"/api/v1/orgs/{org.slug}/memberships/{m.id}/", {"role": "owner"}, format="json")
    assert r.status_code == 200, r.content
    m.refresh_from_db()
    assert m.role == "owner"
    # acting owner stays owner (co-owners allowed)
    assert OrganizationMembership.objects.get(user=owner, organization=org).role == "owner"
```

Add `import pytest`, `pytestmark = pytest.mark.django_db`, and the `OrganizationMembership` import if creating the file.

- [ ] **Step 2: Run, expect FAIL** (first test fails — self-edit currently allowed):

```bash
cd backend && uv run pytest tests/test_memberships.py -k "own_role or make_another" -v
```

- [ ] **Step 3: Add the guard in `backend/apps/orgs/views.py` `OrgMembershipDetailView.partial_update`.** Immediately after `membership = self._get_membership(request, membership_id)`:

```python
if membership.user_id == request.user.id:
    return Response(
        {"detail": "You cannot change your own role. Ask another owner/admin."},
        status=status.HTTP_400_BAD_REQUEST,
    )
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd backend && uv run pytest tests/test_memberships.py -k "own_role or make_another" -v
```
Expected: 2 pass. Also run the full membership suite to confirm no regression:
```bash
cd backend && uv run pytest tests/test_memberships.py -v
```

### Task L5.2 — Frontend: own-row guard + "Make owner" action

- [ ] **Step 1: Edit `frontend/components/orgs/members-table.tsx`.** Add imports:

```tsx
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useMe } from "@/lib/auth";
```

Inside `MembersTable`, add `const me = useMe();`.

- [ ] **Step 2: Replace the per-row Role cell** (the inline `<select>` from L2 state). The select must (a) be disabled on the current user's own row, (b) omit the "owner" option. Promotion to owner happens via a separate "Make owner" action in the Actions cell. New Role cell:

```tsx
<td className="py-2">
  {m.role === "owner" ? (
    <span className="text-xs font-medium">Owner</span>
  ) : (
    <select
      value={m.role ?? ""}
      onChange={(e) => updateRole.mutate({ membershipId: m.id, role: e.target.value })}
      disabled={updateRole.isPending || m.user_email === me.data?.email}
      className="rounded border border-input bg-background px-2 py-1 text-xs"
    >
      <option value="admin">Admin</option>
      <option value="manager">Manager</option>
      <option value="staff">Staff</option>
    </select>
  )}
</td>
```

- [ ] **Step 3: Add a "Make owner" control to the Actions cell** (alongside the L2 Remove `ConfirmDialog`), shown only for non-owners and not for your own row:

```tsx
{m.role !== "owner" && m.user_email !== me.data?.email && (
  <ConfirmDialog
    trigger={
      <Button variant="outline" size="sm">
        Make owner
      </Button>
    }
    title="Make this member an owner?"
    description={`${m.user_email} will gain full owner permissions. Owners can manage billing, members, and all events.`}
    confirmLabel="Make owner"
    destructive={false}
    onConfirm={() => updateRole.mutate({ membershipId: m.id, role: "owner" })}
  />
)}
```

Wrap the Remove dialog + Make-owner control in a `<span className="space-x-2 whitespace-nowrap">` so they sit on one line.

- [ ] **Step 4: Type/lint check.**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm lint
```

### Task L5.3 — Gates + commit + PR

- [ ] **Step 1: Gates.**
- [ ] **Step 2: Commit.**

```bash
git add backend/apps/orgs/views.py backend/tests/test_memberships.py \
        frontend/components/orgs/members-table.tsx
git commit -m "feat(plan-l5): transfer ownership via Make-owner action + block self-role-change"
```

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feature/plan-l5-transfer-ownership
gh auth switch --hostname github.com --user vineidev
gh pr create --repo byondr-co/eventgate --head feature/plan-l5-transfer-ownership --base main \
  --title "feat(plan-l5): transfer ownership" \
  --body "$(cat <<'EOF'
## Summary
Plan L slice 5/8 — L-feat-6 (co-owner model).
- Backend: an owner/admin cannot change **their own** role (400).
- Frontend: inline role dropdown no longer offers "owner" and is disabled on your own row; owners show a static "Owner" label; promoting a co-owner happens via a confirm-gated **Make owner** action. Multi-owner stays allowed.

## Test plan
- [ ] CI green
- [ ] Manual: own-row dropdown disabled; Make owner promotes a member; can't self-demote
EOF
)"
```

- [ ] **Step 4: Report PR URL.**

---

## PR L6 — Public media storage helper + Tigris provisioning

**Item:** L-ops-2

**Branch:** `feature/plan-l6-public-storage`

**Depends on:** L1 merged.

> **Reality check (done during planning):** `backend/config/settings/prod.py` ALREADY defines a complete `STORAGES["default"]` S3 (Tigris) backend gated on `BUCKET_NAME`, and `django-storages[s3]`/`boto3` are already dependencies. That default is `default_acl: "private"` + `querystring_auth: True` (signed, expiring URLs) — correct for CSV imports (staff-only) but **wrong for a public registration banner**, whose URL must be public and non-expiring. This PR adds a *public* storage selector that banners use, and provisions the bucket. No change to the existing private default.

**Files:**
- Create: `backend/apps/common/storage.py`
- Create: `backend/tests/test_public_storage.py`
- Modify: `backend/config/settings/prod.py` (add a `MEDIA_PUBLIC` storages alias)
- Modify: `docs/plans/2026-05-23-pilot-launch-runbook.md` (append the provisioning checklist)

### Task L6.1 — Public storage selector (TDD)

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_public_storage.py`:

```python
from __future__ import annotations

from django.core.files.storage import FileSystemStorage

from apps.common.storage import public_media_storage


def test_falls_back_to_filesystem_when_no_public_bucket(settings):
    # test settings define no STORAGES["media_public"] → local filesystem
    storage = public_media_storage()
    assert isinstance(storage, FileSystemStorage)
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd backend && uv run pytest tests/test_public_storage.py -v
```

- [ ] **Step 3: Create `backend/apps/common/storage.py`.**

```python
"""Storage selector for publicly-served uploads (e.g. event banners).

Returns an S3 (Tigris) storage with public-read ACL and NO signed-URL expiry
when a public bucket is configured (prod/staging), else the default local
filesystem storage (dev/test). Used as a callable `storage=` on ImageFields so
the chosen backend is resolved at runtime, not baked into migrations.
"""

from __future__ import annotations

from django.conf import settings
from django.core.files.storage import FileSystemStorage, storages


def public_media_storage():
    if "media_public" in getattr(settings, "STORAGES", {}):
        return storages["media_public"]
    return FileSystemStorage()
```

- [ ] **Step 4: Run, expect PASS.**

```bash
cd backend && uv run pytest tests/test_public_storage.py -v
```

### Task L6.2 — Register the public storage alias in prod settings

- [ ] **Step 1: Edit `backend/config/settings/prod.py`.** Inside the existing `if BUCKET_NAME:` block, add a `"media_public"` entry to the `STORAGES` dict (a second S3Storage pointed at the same bucket but public-read, no signed URLs):

```python
        "media_public": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                "access_key": env("AWS_ACCESS_KEY_ID"),
                "secret_key": env("AWS_SECRET_ACCESS_KEY"),
                "bucket_name": BUCKET_NAME,
                "endpoint_url": env("AWS_ENDPOINT_URL_S3"),
                "region_name": env("AWS_REGION", default="auto"),
                "location": "public",          # key prefix; keeps public objects separate
                "default_acl": "public-read",
                "file_overwrite": False,
                "querystring_auth": False,      # stable, non-expiring public URLs
            },
        },
```

Place it as a sibling of `"default"` and `"staticfiles"` (still inside `if BUCKET_NAME:`).

- [ ] **Step 2: Verify Django still boots with prod settings (no creds needed since BUCKET_NAME is unset locally → block skipped).**

```bash
cd backend && DJANGO_SETTINGS_MODULE=config.settings.prod SECRET_KEY=x DEBUG=False ALLOWED_HOSTS='*' DATABASE_URL='sqlite://:memory:' uv run python -c "import django; django.setup(); print('ok')" 2>&1 | tail -1
```
Expected: `ok` (BUCKET_NAME empty → STORAGES block skipped; falls back to base defaults).

### Task L6.3 — Provisioning checklist (runbook, no code)

- [ ] **Step 1: Append to `docs/plans/2026-05-23-pilot-launch-runbook.md`** a "Tigris object storage (Plan L)" section:

```markdown
## Tigris object storage (Plan L — banner uploads)

Storage code already exists (`config/settings/prod.py`, gated on `BUCKET_NAME`).
Provision the bucket + secrets per environment so banners (and CSV imports) persist
across redeploys:

```bash
# Prod
flyctl storage create --app eventgate-backend-prod
# → injects BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION as Fly secrets

# Staging
flyctl storage create --app eventgate-backend-staging
```

Verify after deploy:
- `flyctl secrets list --app eventgate-backend-prod` shows BUCKET_NAME + AWS_* keys.
- Upload a banner via the dashboard; confirm the public URL renders on the registration page and does NOT carry an expiring `?X-Amz-...` signature (public-read, querystring_auth=False on `media_public`).
```
```

> **Dispatcher note:** the `flyctl storage create` commands are run by the human operator (they create cloud resources + secrets), not by the PR-slice agent. The agent only lands the code + doc.

### Task L6.4 — Gates + commit + PR

- [ ] **Step 1: Gates.**
- [ ] **Step 2: Commit.**

```bash
git add backend/apps/common/storage.py backend/tests/test_public_storage.py \
        backend/config/settings/prod.py docs/plans/2026-05-23-pilot-launch-runbook.md
git commit -m "feat(plan-l6): public media storage selector for banners + Tigris provisioning checklist"
```

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feature/plan-l6-public-storage
gh auth switch --hostname github.com --user vineidev
gh pr create --repo byondr-co/eventgate --head feature/plan-l6-public-storage --base main \
  --title "feat(plan-l6): public media storage for banners" \
  --body "$(cat <<'EOF'
## Summary
Plan L slice 6/8 — L-ops-2. The private Tigris default already exists; this adds a **public-read, non-expiring** `media_public` storage alias for the upcoming banner uploads, plus a `public_media_storage()` selector (falls back to local FS in dev/test). Runbook documents `flyctl storage create` provisioning (operator-run).

## Test plan
- [ ] CI green
- [ ] Operator: run `flyctl storage create` on prod + staging, confirm secrets present
EOF
)"
```

- [ ] **Step 4: Report PR URL.**

---

## PR L7 — Registration banner + description

**Item:** L-feat-2

**Branch:** `feature/plan-l7-reg-banner`

**Depends on:** L6 merged (uses `public_media_storage`).

**Files:**
- Modify: `backend/pyproject.toml` (add Pillow)
- Modify: `backend/apps/events/models.py` (banner_image + description)
- Create: `backend/apps/events/migrations/00NN_event_banner_description.py` (via makemigrations)
- Modify: `backend/apps/events/serializers.py` (writable description + banner_image)
- Modify: `backend/apps/events/views.py` (`PublicEventDetailView` exposes both)
- Create: `backend/tests/test_event_banner.py`
- Modify: `frontend/lib/api.ts` (FormData support in `apiFetch`)
- Modify: `frontend/lib/events.ts` (types + `useUpdateEvent` description + `useUploadBanner`)
- Create: `frontend/components/events/event-presentation-editor.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/form/page.tsx` (render the editor)
- Modify: `frontend/components/guests/registration-form.tsx` (render banner + description)
- Modify: `frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx` (pass props)

### Task L7.1 — Backend: model fields + Pillow + migration

- [ ] **Step 1: Add Pillow to `backend/pyproject.toml`** dependencies (alphabetically near other deps):

```toml
  "pillow>=10.0,<12.0",
```

- [ ] **Step 2: Lock + sync.**

```bash
cd backend && uv lock && uv sync --frozen
```

- [ ] **Step 3: Add fields to `Event` in `backend/apps/events/models.py`.** Add import at top: `from apps.common.storage import public_media_storage`. Add fields (after `venue`):

```python
    banner_image = models.ImageField(
        upload_to="event-banners/", storage=public_media_storage, null=True, blank=True
    )
    description = models.TextField(blank=True)
```

- [ ] **Step 4: Make + inspect the migration.**

```bash
cd backend && uv run python manage.py makemigrations events
```
Expected: a new migration adding `banner_image` + `description`. Open it; confirm `storage=apps.common.storage.public_media_storage` is referenced (callable, not an instance).

- [ ] **Step 5: Migrate (sanity, local sqlite/pg).**

```bash
cd backend && uv run python manage.py migrate events
```

### Task L7.2 — Backend: serializer + public exposure (TDD)

- [ ] **Step 1: Write the failing test.** Create `backend/tests/test_event_banner.py`:

```python
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db
User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner, role: str = "owner"):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role=role)
    return org


def test_patch_description_persists():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.patch(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/",
        {"description": "Doors at 7pm."},
        format="json",
    )
    assert r.status_code == 200, r.content
    event.refresh_from_db()
    assert event.description == "Doors at 7pm."


def test_public_detail_exposes_description_and_null_banner():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    Event.objects.create(organization=org, name="E", slug="e", description="Welcome")
    c = APIClient()
    r = c.get(f"/api/v1/e/{org.slug}/e/")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["description"] == "Welcome"
    assert body["banner_image"] is None
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd backend && uv run pytest tests/test_event_banner.py -v
```

- [ ] **Step 3: Make `description` + `banner_image` writable in `EventSerializer`** (`backend/apps/events/serializers.py`). Add both to `fields`:

```python
        fields = (
            "id",
            "name",
            "slug",
            "status",
            "starts_at",
            "ends_at",
            "timezone",
            "venue",
            "description",
            "banner_image",
            "registration_open",
            "walkins_enabled",
            "walkin_capacity",
            "created_at",
        )
        read_only_fields = ("id", "created_at")
```

- [ ] **Step 4: Expose both in `PublicEventDetailView.get`** (`backend/apps/events/views.py`). Add to the returned dict (after `"venue": event.venue,`):

```python
                "description": event.description,
                "banner_image": (
                    request.build_absolute_uri(event.banner_image.url)
                    if event.banner_image
                    else None
                ),
```

- [ ] **Step 5: Run, expect PASS.**

```bash
cd backend && uv run pytest tests/test_event_banner.py -v
```
Expected: 2 pass.

### Task L7.3 — Frontend: apiFetch FormData support + events lib

- [ ] **Step 1: Make `apiFetch` skip JSON content-type for `FormData`** (`frontend/lib/api.ts`). Replace the `headers` line in the `fetch` call:

```ts
  const isFormData = init.body instanceof FormData;
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
    cache: "no-store",
    ...init,
  });
```

- [ ] **Step 2: Extend `frontend/lib/events.ts`.** Add `description: string` and `banner_image: string | null` to both the `Event` type and the `PublicEventDetail` type. Extend `useUpdateEvent`'s input union to include `description`:

```ts
  mutationFn: (
    input: Partial<Pick<Event, "walkin_capacity" | "walkins_enabled" | "venue" | "description">>,
  ) =>
```

Add a banner upload mutation:

```ts
export function useUploadBanner(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("banner_image", file);
      return apiFetch<Event>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/`, {
        method: "PATCH",
        body: fd,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events", orgSlug, eventSlug] });
      qc.invalidateQueries({ queryKey: ["public-event", orgSlug, eventSlug] });
    },
  });
}
```

### Task L7.4 — Frontend: presentation editor on the Form tab

- [ ] **Step 1: Create `frontend/components/events/event-presentation-editor.tsx`.**

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
import { useEvent, useUpdateEvent, useUploadBanner } from "@/lib/events";

export function EventPresentationEditor({
  orgSlug,
  eventSlug,
}: {
  orgSlug: string;
  eventSlug: string;
}) {
  const event = useEvent(orgSlug, eventSlug);
  const update = useUpdateEvent(orgSlug, eventSlug);
  const uploadBanner = useUploadBanner(orgSlug, eventSlug);
  const [description, setDescription] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const value = description ?? event.data?.description ?? "";

  const saveDescription = async () => {
    setNotice(null);
    try {
      await update.mutateAsync({ description: value });
      setNotice("Saved.");
    } catch (e) {
      setNotice(extractApiError(e));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNotice(null);
    try {
      await uploadBanner.mutateAsync(file);
      setNotice("Banner uploaded.");
    } catch (err) {
      setNotice(extractApiError(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration page</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <span className="text-sm font-medium">Banner image</span>
          {event.data?.banner_image && (
            <img
              src={event.data.banner_image}
              alt="Current banner"
              className="mt-2 h-24 w-full rounded-md object-cover"
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            disabled={uploadBanner.isPending}
            className="mt-2 block text-sm"
          />
        </div>
        <label className="block">
          <span className="text-sm font-medium">Description</span>
          <textarea
            value={value}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="A short welcome shown under the event name on the registration page."
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={saveDescription} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save description"}
          </Button>
          {notice && <span className="text-sm text-muted-foreground">{notice}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render it on the Form tab.** Edit `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/form/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";

import { EventPresentationEditor } from "@/components/events/event-presentation-editor";
import { RegistrationFormBuilder } from "@/components/events/registration-form-builder";

export default function EventFormPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Registration form</h1>
      <EventPresentationEditor orgSlug={slug} eventSlug={eventSlug} />
      <RegistrationFormBuilder orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
```

### Task L7.5 — Public registration page renders banner + description

- [ ] **Step 1: Edit `frontend/components/guests/registration-form.tsx`.** Add `bannerImage?: string | null` and `description?: string` to `Props`, destructure them, and render above/within the card. Replace the `<CardHeader>` block and add a banner above the card:

```tsx
  return (
    <Card className="overflow-hidden">
      {bannerImage ? (
        <img src={bannerImage} alt="" className="h-40 w-full object-cover" />
      ) : null}
      <CardHeader>
        <CardTitle>{t("title", { eventName })}</CardTitle>
        <CardDescription>{description ? description : venue ? venue : t("subtitle")}</CardDescription>
      </CardHeader>
```

(Keep the rest of the component unchanged.)

- [ ] **Step 2: Pass the props in `frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx`.** Update the `<RegistrationForm>` usage:

```tsx
        <RegistrationForm
          orgSlug={orgSlug}
          eventSlug={eventSlug}
          eventName={event.name}
          venue={event.venue}
          fields={event.fields}
          bannerImage={event.banner_image}
          description={event.description}
        />
```

(`event.banner_image` / `event.description` now exist on `PublicEventDetail` from L7.3.)

### Task L7.6 — Gates + commit + PR

- [ ] **Step 1: Gates** (includes a fresh `uv sync` because Pillow was added).
- [ ] **Step 2: Commit.**

```bash
git add backend/pyproject.toml backend/uv.lock backend/apps/events/models.py \
        backend/apps/events/migrations/ backend/apps/events/serializers.py \
        backend/apps/events/views.py backend/tests/test_event_banner.py \
        frontend/lib/api.ts frontend/lib/events.ts \
        frontend/components/events/event-presentation-editor.tsx \
        "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/form/page.tsx" \
        frontend/components/guests/registration-form.tsx \
        "frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx"
git commit -m "feat(plan-l7): registration banner image + description with public storage"
```

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feature/plan-l7-reg-banner
gh auth switch --hostname github.com --user vineidev
gh pr create --repo byondr-co/eventgate --head feature/plan-l7-reg-banner --base main \
  --title "feat(plan-l7): registration banner + description" \
  --body "$(cat <<'EOF'
## Summary
Plan L slice 7/8 — L-feat-2 (direction A: cover banner). New `Event.banner_image` (uploaded to the public Tigris store via the L6 selector) + `Event.description` (single text). Organizer edits both on the event **Form** tab; the public registration page shows the cover banner + description above the form. Adds Pillow; `apiFetch` now supports `FormData` uploads.

## Test plan
- [ ] CI green
- [ ] Operator note: requires the Tigris bucket from L6 to be provisioned for uploads to persist in prod
- [ ] Manual: upload a banner + save description; confirm both render on /register
EOF
)"
```

- [ ] **Step 4: Report PR URL.**

---

## PR L8 — Per-event "Links" tab (short-URL management)

**Item:** L-feat-3

**Branch:** `feature/plan-l8-links-tab`

**Depends on:** L2 merged (uses `<ConfirmDialog>` for disable).

**Files (backend):**
- Modify: `backend/apps/shorturls/models.py` (visit_count, note, is_active)
- Modify: `backend/apps/guests/models.py` (referrer_short_url FK)
- Create migrations for both apps (via makemigrations)
- Modify: `backend/apps/shorturls/views.py` (redirect tracking; create; detail PATCH; richer list)
- Modify: `backend/apps/shorturls/api_urls.py` (POST + detail route)
- Modify: `backend/apps/guests/views.py` (`PublicRegistrationView` resolves `ref`)
- Modify: `backend/apps/guests/services.py` (`register_guest` accepts `referrer`)
- Create: `backend/tests/test_shorturls_mgmt.py`

**Files (frontend):**
- Modify: `frontend/components/nav/event-tabs-nav.tsx` (add "links" tab)
- Modify: `frontend/lib/i18n/messages/en.json` (+ `km.json`) (`nav.links`)
- Create: `frontend/lib/shorturls.ts`
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/links/page.tsx`
- Create: `frontend/components/shorturls/links-table.tsx`
- Modify: `frontend/components/guests/registration-form.tsx` (include `ref` in submit)

### Task L8.1 — Backend: model fields + migrations

- [ ] **Step 1: Add fields to `ShortUrl`** (`backend/apps/shorturls/models.py`), after `expires_at`:

```python
    visit_count = models.PositiveIntegerField(default=0)
    note = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
```

- [ ] **Step 2: Add the FK to `Guest`** (`backend/apps/guests/models.py`), after the existing fields:

```python
    referrer_short_url = models.ForeignKey(
        "shorturls.ShortUrl",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referred_guests",
    )
```

- [ ] **Step 3: Make migrations.**

```bash
cd backend && uv run python manage.py makemigrations shorturls guests
cd backend && uv run python manage.py migrate
```
Expected: two migrations created and applied.

### Task L8.2 — Backend: redirect tracking + ref attribution (TDD)

- [ ] **Step 1: Write the failing tests.** Create `backend/tests/test_shorturls_mgmt.py`:

```python
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership
from apps.shorturls.models import ShortUrl

pytestmark = pytest.mark.django_db
User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner, role: str = "owner"):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role=role)
    return org


def _event(org):
    return Event.objects.create(organization=org, name="E", slug="e")


def test_redirect_increments_visit_count_and_appends_ref(client):
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = _event(org)
    su = ShortUrl.objects.create(
        short_code="ABC123xy", target_url="https://app/e/o/e/register", event=event
    )
    r = client.get(f"/r/{su.short_code}/")
    assert r.status_code == 302
    assert r["Location"] == "https://app/e/o/e/register?ref=ABC123xy"
    su.refresh_from_db()
    assert su.visit_count == 1


def test_disabled_short_url_returns_404(client):
    su = ShortUrl.objects.create(short_code="dis00000", target_url="https://x", is_active=False)
    r = client.get(f"/r/{su.short_code}/")
    assert r.status_code == 404


def test_registration_with_ref_sets_referrer(client):
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = _event(org)
    su = ShortUrl.objects.create(
        short_code="REF12345", target_url="https://app/e/o/e/register", event=event
    )
    r = client.post(
        f"/api/v1/e/{org.slug}/{event.slug}/register/",
        {"name": "G", "email": "g@x.com", "phone_or_chat": "012", "ref": "REF12345"},
        content_type="application/json",
    )
    assert r.status_code == 201, r.content
    guest = Guest.objects.get(id=r.json()["guest_id"])
    assert guest.referrer_short_url_id == su.id


def test_create_short_url(make_unused=None):
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = _event(org)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/"
    r = c.post(url, {"note": "IG bio"}, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["note"] == "IG bio"
    assert body["is_active"] is True
    assert body["visit_count"] == 0
    assert body["target_url"].endswith(f"/e/{org.slug}/{event.slug}/register")


def test_patch_short_url_note_and_disable():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = _event(org)
    su = ShortUrl.objects.create(short_code="patch001", target_url="https://x", event=event)
    c = APIClient()
    c.force_authenticate(user=owner)
    url = f"/api/v1/orgs/{org.slug}/events/{event.slug}/short-urls/{su.id}/"
    r = c.patch(url, {"note": "updated", "is_active": False}, format="json")
    assert r.status_code == 200, r.content
    su.refresh_from_db()
    assert su.note == "updated"
    assert su.is_active is False
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
cd backend && uv run pytest tests/test_shorturls_mgmt.py -v
```

- [ ] **Step 3: Update `redirect_short_url`** (`backend/apps/shorturls/views.py`). Replace the function body:

```python
from django.db.models import F  # add to imports


@require_GET
def redirect_short_url(request: HttpRequest, short_code: str) -> HttpResponse:
    su = get_object_or_404(ShortUrl, short_code=short_code)
    if not su.is_active:
        return HttpResponse("Not found", status=404)
    if su.expires_at and su.expires_at < timezone.now():
        return HttpResponse("Expired", status=404)
    ShortUrl.objects.filter(pk=su.pk).update(visit_count=F("visit_count") + 1)
    sep = "&" if "?" in su.target_url else "?"
    return redirect(f"{su.target_url}{sep}ref={su.short_code}")
```

- [ ] **Step 4: Accept `referrer` in `register_guest`** (`backend/apps/guests/services.py`). Add a typing import block at top:

```python
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from apps.shorturls.models import ShortUrl
```

Change the signature and the `Guest.objects.create(...)` call:

```python
def register_guest(
    *, event: Event, payload: dict[str, Any], source: str = "public_form",
    referrer: "ShortUrl | None" = None,
) -> Guest:
    ...
    guest = Guest.objects.create(
        organization=event.organization,
        event=event,
        guest_type="pre_registered",
        entry_token=token,
        entry_status="registered_not_arrived",
        info_status="info_completed",
        full_name=preset.get("name", ""),
        email=preset.get("email", ""),
        phone_or_chat=preset.get("phone_or_chat", ""),
        custom_fields=custom,
        source=source,
        referrer_short_url=referrer,
    )
```

- [ ] **Step 5: Resolve `ref` in `PublicRegistrationView.post`** (`backend/apps/guests/views.py`). Before `guest = register_guest(...)`:

```python
        from apps.shorturls.models import ShortUrl

        ref = request.data.get("ref")
        referrer = (
            ShortUrl.objects.filter(event=event, short_code=ref, is_active=True).first()
            if ref
            else None
        )
```
and pass `referrer=referrer` into `register_guest(event=event, payload=request.data, referrer=referrer)`.

- [ ] **Step 6: Add create + detail views and richer list** (`backend/apps/shorturls/views.py`). Replace `EventShortUrlListView` and add a detail view:

```python
from django.conf import settings  # add if missing
from apps.shorturls.services import generate_short_code  # add


def _serialize(s: ShortUrl) -> dict:
    return {
        "id": str(s.id),
        "short_code": s.short_code,
        "target_url": s.target_url,
        "note": s.note,
        "visit_count": s.visit_count,
        "is_active": s.is_active,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        "created_at": s.created_at.isoformat(),
    }


class EventShortUrlListView(viewsets.GenericViewSet, mixins.ListModelMixin):
    """GET/POST /api/v1/orgs/<slug>/events/<eventSlug>/short-urls/"""

    permission_classes = (IsAuthenticated, IsOrgMember)

    def _event(self, request, event_slug):
        return get_object_or_404(Event, organization=request.organization, slug=event_slug)

    def list(self, request, org_slug=None, event_slug=None):
        event = self._event(request, event_slug)
        qs = ShortUrl.objects.filter(event=event).order_by("-created_at")
        results = [_serialize(s) for s in qs]
        return Response({"count": len(results), "results": results})

    def create(self, request, org_slug=None, event_slug=None):
        event = self._event(request, event_slug)
        target = f"{getattr(settings, 'PUBLIC_BASE_URL', '')}/e/{org_slug}/{event_slug}/register"
        su = ShortUrl.objects.create(
            short_code=generate_short_code(),
            target_url=target,
            event=event,
            note=request.data.get("note", ""),
            expires_at=request.data.get("expires_at") or None,
        )
        return Response(_serialize(su), status=status.HTTP_201_CREATED)


class EventShortUrlDetailView(viewsets.GenericViewSet):
    """PATCH /api/v1/orgs/<slug>/events/<eventSlug>/short-urls/<id>/ (note, expires_at, is_active)"""

    permission_classes = (IsAuthenticated, IsOrgMember)

    def partial_update(self, request, org_slug=None, event_slug=None, pk=None):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        su = get_object_or_404(ShortUrl, id=pk, event=event)
        if "note" in request.data:
            su.note = request.data["note"]
        if "expires_at" in request.data:
            su.expires_at = request.data["expires_at"] or None
        if "is_active" in request.data:
            su.is_active = bool(request.data["is_active"])
        su.save(update_fields=["note", "expires_at", "is_active"])
        return Response(_serialize(su))
```

Add `status` to the rest_framework imports if missing (`from rest_framework import mixins, status, viewsets`).

- [ ] **Step 7: Wire routes** (`backend/apps/shorturls/api_urls.py`):

```python
from django.urls import path

from apps.shorturls.views import EventShortUrlDetailView, EventShortUrlListView

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/short-urls/",
        EventShortUrlListView.as_view({"get": "list", "post": "create"}),
        name="event-short-urls",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/short-urls/<uuid:pk>/",
        EventShortUrlDetailView.as_view({"patch": "partial_update"}),
        name="event-short-url-detail",
    ),
]
```

- [ ] **Step 8: Run, expect PASS.**

```bash
cd backend && uv run pytest tests/test_shorturls_mgmt.py tests/test_short_urls.py -v
```
Expected: all pass (existing redirect tests still green — they create active ShortUrls so visit increment + ref append apply; note `test_redirect_returns_302` asserts a bare `Location` with no event — that ShortUrl has no event and `is_active` defaults True, so it now redirects to `https://example.com/landing?ref=<code>`. **Update that existing assertion** in `tests/test_short_urls.py` to expect the `?ref=` suffix, or set the test's target to include the suffix. Adjust it as part of this step.)

> **Note:** Step 8 requires editing `backend/tests/test_short_urls.py::test_redirect_returns_302` to expect `…/landing?ref=<code>`. Make that edit.

### Task L8.3 — Frontend: Links tab nav + i18n

- [ ] **Step 1: Add the tab to `frontend/components/nav/event-tabs-nav.tsx`.** Add `"links"` to the `TabKey` union, and insert into `TABS` after the `guests` entry:

```tsx
  { key: "links", suffix: "/links" },
```

- [ ] **Step 2: Add the i18n label.** In `frontend/lib/i18n/messages/en.json`, add `"links": "Links"` to the `nav` namespace. In `km.json`, add `"links": "តំណ"` to the `nav` namespace. (Confirm namespaces with `grep -n '"nav"' frontend/lib/i18n/messages/en.json`.)

### Task L8.4 — Frontend: shorturls lib

- [ ] **Step 1: Create `frontend/lib/shorturls.ts`.**

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type ShortUrl = {
  id: string;
  short_code: string;
  target_url: string;
  note: string;
  visit_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

type Paginated<T> = { count: number; results: T[] };

const key = (orgSlug: string, eventSlug: string) => ["short-urls", orgSlug, eventSlug];

export function useShortUrls(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: key(orgSlug, eventSlug),
    queryFn: () =>
      apiFetch<Paginated<ShortUrl>>(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/short-urls/`,
      ),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useCreateShortUrl(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { note?: string; expires_at?: string | null }) =>
      apiFetch<ShortUrl>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/short-urls/`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgSlug, eventSlug) }),
  });
}

export function useUpdateShortUrl(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      note?: string;
      expires_at?: string | null;
      is_active?: boolean;
    }) =>
      apiFetch<ShortUrl>(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/short-urls/${id}/`,
        { method: "PATCH", body: JSON.stringify(patch) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgSlug, eventSlug) }),
  });
}
```

### Task L8.5 — Frontend: Links page + table

- [ ] **Step 1: Create `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/links/page.tsx`.**

```tsx
"use client";

import { useParams } from "next/navigation";

import { LinksTable } from "@/components/shorturls/links-table";

export default function EventLinksPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Links</h1>
      <LinksTable orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/components/shorturls/links-table.tsx`.**

```tsx
"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
import { useCreateShortUrl, useShortUrls, useUpdateShortUrl } from "@/lib/shorturls";

export function LinksTable({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const links = useShortUrls(orgSlug, eventSlug);
  const create = useCreateShortUrl(orgSlug, eventSlug);
  const update = useUpdateShortUrl(orgSlug, eventSlug);
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const shortUrl = (code: string) =>
    typeof window === "undefined" ? `/r/${code}` : `${window.location.origin}/r/${code}`;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      await create.mutateAsync({ note, expires_at: expiresAt || null });
      setNote("");
      setExpiresAt("");
    } catch (err) {
      setNotice(extractApiError(err));
    }
  };

  const copy = async (code: string) => {
    setNotice(null);
    try {
      await navigator.clipboard.writeText(shortUrl(code));
      setNotice("Link copied.");
    } catch {
      setNotice("Could not copy.");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New registration link</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Label (e.g. Instagram bio)"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "New link"}
            </Button>
          </form>
          {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Short links {links.data && `(${links.data.count})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {links.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {links.data && links.data.results.length === 0 && (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          )}
          {links.data && links.data.results.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Short link</th>
                  <th className="text-left font-normal py-2">Visits</th>
                  <th className="text-left font-normal py-2">Note</th>
                  <th className="text-left font-normal py-2">Expires</th>
                  <th className="text-right font-normal py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {links.data.results.map((s) => (
                  <tr key={s.id} className={`border-b ${s.is_active ? "" : "opacity-50"}`}>
                    <td className="py-2 font-mono text-xs">/r/{s.short_code}</td>
                    <td className="py-2">{s.visit_count}</td>
                    <td className="py-2">
                      <input
                        defaultValue={s.note}
                        onBlur={(e) => {
                          if (e.target.value !== s.note)
                            update.mutate({ id: s.id, note: e.target.value });
                        }}
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="date"
                        defaultValue={s.expires_at ? s.expires_at.slice(0, 10) : ""}
                        onChange={(e) =>
                          update.mutate({ id: s.id, expires_at: e.target.value || null })
                        }
                        className="rounded border border-input bg-background px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="py-2 text-right space-x-2 whitespace-nowrap">
                      <Button variant="outline" size="sm" onClick={() => copy(s.short_code)}>
                        Copy
                      </Button>
                      {s.is_active ? (
                        <ConfirmDialog
                          trigger={
                            <Button variant="outline" size="sm">
                              Disable
                            </Button>
                          }
                          title="Disable this link?"
                          description="Visitors using it will get a 404. You can't undo from here (re-create a new link if needed)."
                          confirmLabel="Disable"
                          onConfirm={() => update.mutate({ id: s.id, is_active: false })}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => update.mutate({ id: s.id, is_active: true })}
                        >
                          Enable
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

(Note: the spec says "disable, no hard delete." An Enable affordance is included so a mistaken disable is recoverable — still no destructive delete.)

### Task L8.6 — Frontend: include `ref` in registration submit

- [ ] **Step 1: Edit `frontend/components/guests/registration-form.tsx`.** Add `import { useSearchParams } from "next/navigation";`, read the ref, and include it in the submit payload:

```tsx
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  // ...
  const { guest_id, entry_token } = await register.mutateAsync({
    ...form,
    ...(ref ? { ref } : {}),
  });
```

### Task L8.7 — Gates + commit + PR

- [ ] **Step 1: Run all gates** (backend + frontend).
- [ ] **Step 2: Commit.**

```bash
git add backend/apps/shorturls/ backend/apps/guests/models.py backend/apps/guests/views.py \
        backend/apps/guests/services.py backend/apps/guests/migrations/ \
        backend/tests/test_shorturls_mgmt.py backend/tests/test_short_urls.py \
        frontend/components/nav/event-tabs-nav.tsx frontend/lib/i18n/messages/en.json \
        frontend/lib/i18n/messages/km.json frontend/lib/shorturls.ts \
        "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/links/page.tsx" \
        frontend/components/shorturls/links-table.tsx \
        frontend/components/guests/registration-form.tsx
git commit -m "feat(plan-l8): per-event Links tab — short-url CRUD, visit tracking, referral attribution"
```

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feature/plan-l8-links-tab
gh auth switch --hostname github.com --user vineidev
gh pr create --repo byondr-co/eventgate --head feature/plan-l8-links-tab --base main \
  --title "feat(plan-l8): per-event Links tab" \
  --body "$(cat <<'EOF'
## Summary
Plan L slice 8/8 — L-feat-3.
- `ShortUrl` gains `visit_count`, `note`, `is_active`. `/r/<code>` increments visits, 404s when disabled/expired, and redirects to the register page with `?ref=<code>`.
- `Guest.referrer_short_url` (SET_NULL) records which link referred each registration.
- New **Links** tab: create registration links (auto code), edit note/expiry, disable/enable, copy, see visit counts. Registration-target only; no hard delete.

## Test plan
- [ ] CI green
- [ ] Manual: create a link, open /r/<code> (redirects + ref), register through it, confirm visit count + referrer recorded; disable → 404
EOF
)"
```

- [ ] **Step 4: Report PR URL.**

---

## Self-review (planning-time checklist — already run)

**Spec coverage:** L-bug-1→L1, L-bug-2→L2, L-bug-3→L1, L-ops-1→L3, L-ops-2→L6, L-feat-2→L7, L-feat-3→L8, L-feat-4→L4, L-feat-5→L4, L-feat-6→L5. All 10 items covered.

**Discoveries baked in (verified against code during planning):**
- `django-storages[s3]` + `boto3` already deps; prod `STORAGES` default already exists (private). L6 only adds a *public* alias + provisioning. Spec env-var names corrected (`BUCKET_NAME`/`AWS_ENDPOINT_URL_S3`/`AWS_REGION`, not the AWS canonical names).
- **Pillow is NOT a dependency** — L7 adds it (required by `ImageField`).
- `generate_short_code()` + the per-event auto-create signal already exist (L8 reuses both).
- `send_qr_email_task` already renders + attaches the QR and embeds a Telegram deep link — L4 just enqueues it.
- The existing `test_short_urls.py::test_redirect_returns_302` assertion must be updated for the new `?ref=` suffix (called out in L8.2 Step 8).

**Type consistency:** `useShortUrls`/`useUpdateShortUrl` share the `ShortUrl` type; `_serialize` (backend) matches that shape field-for-field; `useGuests` search arg threads into the query key; `public_media_storage` is referenced as a callable in both the model field and the migration.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-05-31-plan-l-implementation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per PR slice (L1→L8), review between slices, auto-merge + auto-dispatch-next on CI green. Matches this repo's established per-task-worktree workflow.
2. **Inline Execution** — execute slices in this session with checkpoints.

**Dependency order for dispatch:** L1 and L3 are independent. L2 must merge before L5 and L8. L6 must merge before L7. A reasonable wave plan: **Wave 1** = L1, L2, L3 (parallel); **Wave 2** = L4, L5, L6 (parallel, after L2); **Wave 3** = L7 (after L6), L8 (after L2). Operator must run `flyctl storage create` (L6 runbook) before L7's banner uploads work in prod.
