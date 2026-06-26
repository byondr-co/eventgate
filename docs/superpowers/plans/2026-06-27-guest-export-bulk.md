# Guest Export + Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV export of the (filtered) guest list and multi-select bulk
actions (void / resend-QR / delete / export-selected) to the guest list.

**Architecture:** A shared `filtered_event_guests` selector backs the list view,
a new `POST …/guests/export/` (streamed CSV), and a new `POST …/guests/bulk/`
(`{action,guest_ids}` → `{done,skipped,errors}`, reusing the single-row op logic).
Frontend adds a checkbox column + a `BulkActionBar` + an Export button over the
existing `guests-table`. Spec: `docs/superpowers/specs/2026-06-27-guest-export-bulk-design.md`.

**Tech Stack:** Django + DRF + pytest (backend, stdlib `csv` — NO new dep);
Next.js + React + TanStack Query + Vitest (frontend).

## Global Constraints

- **Commit style:** single-line Conventional Commits, **NO `Co-Authored-By`** trailer.
- **No new dependency** — CSV via stdlib `csv` + `StreamingHttpResponse`.
- **Backend tests:** Postgres on host port **5442** → `cd backend && POSTGRES_PORT=5442 uv run pytest …`; `uv run mypy apps config` clean. Tests flat in `backend/tests/`. Auth-fixture pattern: create Organization/User/OrganizationMembership(role=…)/Event/Guest; `APIClient().force_authenticate(user)`.
- **Frontend gates:** from `frontend/`, `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20`, then `pnpm test -- <pattern> && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`. If a focused vitest run OOMs, prefix `NODE_OPTIONS="--max-old-space-size=512"`. **Avoid `useEffect`+`setState`** (forbidden lint rule) — list/selection state is set from event handlers.
- **Reuse, don't re-derive, the single-row op logic** (already in `backend/apps/guests/views.py`): void sets `entry_status="voided"` + `guest.voided` audit; delete only when no `AuditEvent` rows reference the guest (else skip), writing `guest.deleted` (guest=None) first; resend queues `send_qr_email_task` only for pre-registered guests with an email.
- **Frontend toasts:** use `notify` from `@/lib/toast` (`notify.success(msg)`, `notify.error(err)`) — that's the project idiom in `guests-table.tsx`, not raw sonner.
- **`PRESET_FIELDS = ("name", "email", "phone_or_chat")`** (`apps/guests/services.py:18`) — custom columns = registration fields whose `field_key` is not preset.

---

## Task 1: `filtered_event_guests` selector + refactor list view

**Files:**
- Modify: `backend/apps/guests/services.py` (add the selector)
- Modify: `backend/apps/guests/views.py` (`GuestListView.get_queryset` uses it)
- Test: `backend/tests/test_guest_filter_selector.py` (create)

**Interfaces:**
- Produces: `filtered_event_guests(*, organization, event_slug, search="", entry_status="", guest_type="") -> QuerySet[Guest]` — org/event-scoped guests with the list's search/entry/type filters applied (no ordering, no pagination).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_guest_filter_selector.py
import pytest

from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.services import filtered_event_guests
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_filtered_event_guests_applies_search_and_filters():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         entry_token="t1", full_name="Ana", entry_status="checked_in")
    Guest.objects.create(organization=org, event=event, guest_type="walk_in",
                         entry_token="t2", full_name="Bob", entry_status="registered_not_arrived")

    by_search = filtered_event_guests(organization=org, event_slug="launch", search="ana")
    assert [g.full_name for g in by_search] == ["Ana"]
    by_type = filtered_event_guests(organization=org, event_slug="launch", guest_type="walk_in")
    assert [g.full_name for g in by_type] == ["Bob"]
    by_entry = filtered_event_guests(organization=org, event_slug="launch", entry_status="checked_in")
    assert [g.full_name for g in by_entry] == ["Ana"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_guest_filter_selector.py -q`
Expected: FAIL — `ImportError: cannot import name 'filtered_event_guests'`.

- [ ] **Step 3: Add the selector**

```python
# apps/guests/services.py — add (Q is from django.db.models; import if not already present)
from django.db.models import Q

from apps.guests.models import Guest  # add if not already imported


def filtered_event_guests(*, organization, event_slug, search="", entry_status="", guest_type=""):
    """Org/event-scoped guests with the staff-list filters applied. Shared by the
    list, export, and bulk views so they scope identically. No ordering/pagination."""
    qs = Guest.objects.filter(organization=organization, event__slug=event_slug)
    if entry_status:
        qs = qs.filter(entry_status=entry_status)
    if guest_type:
        qs = qs.filter(guest_type=guest_type)
    if search:
        qs = qs.filter(
            Q(full_name__icontains=search)
            | Q(email__icontains=search)
            | Q(phone_or_chat__icontains=search)
        )
    return qs
```

- [ ] **Step 4: Refactor `GuestListView.get_queryset` to use it**

```python
# apps/guests/views.py — import the selector
from apps.guests.services import (  # extend the existing services import
    MAX_CSV_BYTES,
    CsvParseError,
    EventNotOpen,
    RegistrationError,
    auto_detect,
    filtered_event_guests,
    parse_csv_preview,
    register_guest,
)

# replace GuestListView.get_queryset body with:
    def get_queryset(self):
        p = self.request.query_params
        return filtered_event_guests(
            organization=self.request.organization,
            event_slug=self.kwargs["event_slug"],
            search=p.get("search", ""),
            entry_status=p.get("entry_status", ""),
            guest_type=p.get("guest_type", ""),
        )
```

- [ ] **Step 5: Run selector test + existing guest-list suites + mypy**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_guest_filter_selector.py tests/test_guest_list_ordering.py -q && uv run mypy apps config`
Expected: PASS (refactor preserves list behavior), mypy clean.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/guests/services.py backend/apps/guests/views.py backend/tests/test_guest_filter_selector.py
git commit -m "refactor(guests): extract filtered_event_guests selector"
```

---

## Task 2: CSV export endpoint

**Files:**
- Modify: `backend/apps/guests/views.py` (new `GuestExportView`)
- Modify: `backend/apps/guests/urls.py` (route + import)
- Test: `backend/tests/test_guest_export.py` (create)

**Interfaces:**
- Consumes: `filtered_event_guests` (Task 1), `PRESET_FIELDS`, `RegistrationField`.
- Produces: `POST /api/v1/orgs/<org>/events/<event>/guests/export/` → streamed
  `text/csv` (attachment). Body `{"filters"?: {search,entry_status,guest_type,ordering}, "ids"?: [uuid]}`.
  Columns: `Name,Email,Phone/Chat,<custom field labels…>,Type,Entry status,Checked in at,Registered at`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_guest_export.py
import csv as _csv
import io

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event, RegistrationField
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    RegistrationField.objects.create(event=event, field_key="company", label_en="Company", order_index=1)
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         entry_token="t1", full_name="Ana", email="ana@x.com",
                         custom_fields={"company": "Acme Inc"})
    Guest.objects.create(organization=org, event=event, guest_type="walk_in",
                         entry_token="t2", full_name="Bob", entry_status="checked_in")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event


def export_url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/export/"


def _rows(resp):
    text = b"".join(resp.streaming_content).decode("utf-8")
    return list(_csv.reader(io.StringIO(text)))


@pytest.mark.django_db
def test_export_columns_and_custom_field(setup):
    client, org, event = setup
    resp = client.post(export_url(org, event), {}, format="json")
    assert resp.status_code == 200
    assert resp["Content-Disposition"] == 'attachment; filename="launch-guests.csv"'
    rows = _rows(resp)
    assert rows[0] == ["Name", "Email", "Phone/Chat", "Company", "Type", "Entry status", "Checked in at", "Registered at"]
    ana = next(r for r in rows[1:] if r[0] == "Ana")
    assert ana[3] == "Acme Inc"  # custom field column


@pytest.mark.django_db
def test_export_respects_filters(setup):
    client, org, event = setup
    resp = client.post(export_url(org, event), {"filters": {"guest_type": "walk_in"}}, format="json")
    names = [r[0] for r in _rows(resp)[1:]]
    assert names == ["Bob"]


@pytest.mark.django_db
def test_export_ids_subset(setup):
    client, org, event = setup
    bob = Guest.objects.get(event=event, full_name="Bob")
    resp = client.post(export_url(org, event), {"ids": [str(bob.id)]}, format="json")
    names = [r[0] for r in _rows(resp)[1:]]
    assert names == ["Bob"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_guest_export.py -q`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement the view**

```python
# apps/guests/views.py — add imports at top
import csv as _csv
import io as _io

from django.http import StreamingHttpResponse

from apps.events.models import Event, RegistrationField  # Event likely already imported; add RegistrationField
from apps.guests.services import PRESET_FIELDS  # extend the services import

_EXPORT_ORDERING = {"full_name", "email", "created_at", "entry_status", "checked_in_at"}


class GuestExportView(APIView):
    """POST /api/v1/orgs/<org>/events/<event>/guests/export/ — streamed CSV."""

    permission_classes = (IsAuthenticated, IsOrgMember)

    def post(self, request: Request, org_slug: str, event_slug: str) -> StreamingHttpResponse:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        body = request.data if isinstance(request.data, dict) else {}
        ids = body.get("ids")
        filters = body.get("filters") or {}

        if ids:
            qs = Guest.objects.filter(organization=request.organization, event=event, id__in=ids)
        else:
            qs = filtered_event_guests(
                organization=request.organization,
                event_slug=event_slug,
                search=filters.get("search", ""),
                entry_status=filters.get("entry_status", ""),
                guest_type=filters.get("guest_type", ""),
            )
        ordering = filters.get("ordering") or "-created_at"
        qs = qs.order_by(ordering if ordering.lstrip("-") in _EXPORT_ORDERING else "-created_at")

        reg_fields = list(
            RegistrationField.objects.filter(event=event)
            .exclude(field_key__in=PRESET_FIELDS)
            .order_by("order_index", "field_key")
        )
        header = (
            ["Name", "Email", "Phone/Chat"]
            + [f.label_en for f in reg_fields]
            + ["Type", "Entry status", "Checked in at", "Registered at"]
        )

        def stream():
            buf = _io.StringIO()
            writer = _csv.writer(buf)

            def flush():
                data = buf.getvalue()
                buf.seek(0)
                buf.truncate(0)
                return data

            writer.writerow(header)
            yield flush()
            for g in qs.iterator():
                cf = g.custom_fields or {}
                writer.writerow(
                    [g.full_name, g.email, g.phone_or_chat]
                    + [cf.get(f.field_key, "") for f in reg_fields]
                    + [
                        g.guest_type,
                        g.entry_status,
                        g.checked_in_at.isoformat() if g.checked_in_at else "",
                        g.created_at.isoformat() if g.created_at else "",
                    ]
                )
                yield flush()

        resp = StreamingHttpResponse(stream(), content_type="text/csv")
        resp["Content-Disposition"] = f'attachment; filename="{event_slug}-guests.csv"'
        return resp
```

- [ ] **Step 4: Add the route**

```python
# apps/guests/urls.py — import GuestExportView, then add (before the <uuid:guest_id> routes is fine; "export" is not a uuid so order is irrelevant)
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/export/",
        GuestExportView.as_view(),
        name="guest-export",
    ),
```

- [ ] **Step 5: Run tests + mypy**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_guest_export.py -q && uv run mypy apps config`
Expected: PASS, mypy clean.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/guests/views.py backend/apps/guests/urls.py backend/tests/test_guest_export.py
git commit -m "feat(guests): CSV export endpoint (filtered view + selected ids)"
```

---

## Task 3: Bulk actions endpoint

**Files:**
- Modify: `backend/apps/guests/views.py` (new `GuestBulkView`)
- Modify: `backend/apps/guests/urls.py` (route + import)
- Test: `backend/tests/test_guest_bulk.py` (create)

**Interfaces:**
- Produces: `POST /api/v1/orgs/<org>/events/<event>/guests/bulk/` body
  `{"action": "void"|"resend_qr"|"delete", "guest_ids": [uuid]}` →
  `200 {"action", "done": int, "skipped": [{"id","reason"}], "errors": [{"id","error"}]}`.
  Roles: owner/admin/manager.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_guest_bulk.py
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.services import write_audit
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event


def bulk_url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/bulk/"


@pytest.mark.django_db
def test_bulk_void(setup):
    client, org, event = setup
    g = Guest.objects.create(organization=org, event=event, guest_type="pre_registered", entry_token="t1")
    resp = client.post(bulk_url(org, event), {"action": "void", "guest_ids": [str(g.id)]}, format="json")
    assert resp.status_code == 200
    assert resp.json()["done"] == 1
    g.refresh_from_db()
    assert g.entry_status == "voided"


@pytest.mark.django_db
def test_bulk_delete_skips_history(setup):
    client, org, event = setup
    clean = Guest.objects.create(organization=org, event=event, guest_type="pre_registered", entry_token="t1")
    historied = Guest.objects.create(organization=org, event=event, guest_type="pre_registered", entry_token="t2")
    write_audit(organization=org, event=event, guest=historied, actor_type="user", actor_id="x",
                action="checkin.success", result="success")
    resp = client.post(bulk_url(org, event), {"action": "delete", "guest_ids": [str(clean.id), str(historied.id)]}, format="json")
    body = resp.json()
    assert body["done"] == 1
    assert body["skipped"] == [{"id": str(historied.id), "reason": "has_history"}]
    assert not Guest.objects.filter(pk=clean.pk).exists()
    assert Guest.objects.filter(pk=historied.pk).exists()


@pytest.mark.django_db
def test_bulk_resend_skips_walkin_and_no_email(setup):
    client, org, event = setup
    ok = Guest.objects.create(organization=org, event=event, guest_type="pre_registered", entry_token="t1", email="a@x.com")
    walkin = Guest.objects.create(organization=org, event=event, guest_type="walk_in", entry_token="t2", email="b@x.com")
    resp = client.post(bulk_url(org, event), {"action": "resend_qr", "guest_ids": [str(ok.id), str(walkin.id)]}, format="json")
    body = resp.json()
    assert body["done"] == 1
    assert {"id": str(walkin.id), "reason": "walk_in"} in body["skipped"]


@pytest.mark.django_db
def test_bulk_rejects_bad_action(setup):
    client, org, event = setup
    resp = client.post(bulk_url(org, event), {"action": "nuke", "guest_ids": []}, format="json")
    assert resp.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_guest_bulk.py -q`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement the view**

```python
# apps/guests/views.py — add (write_audit already imported; transaction from django.db; HasOrgRole imported)
from django.db import transaction


class GuestBulkView(APIView):
    """POST /api/v1/orgs/<org>/events/<event>/guests/bulk/ — apply one action to many guests."""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def post(self, request: Request, org_slug: str, event_slug: str) -> Response:
        from apps.audit.models import AuditEvent

        action = request.data.get("action")
        ids = request.data.get("guest_ids") or []
        if action not in ("void", "resend_qr", "delete"):
            return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)

        found = {
            str(g.id): g
            for g in Guest.objects.filter(
                organization=request.organization, event__slug=event_slug, id__in=ids
            )
        }
        done = 0
        skipped: list[dict] = []
        errors: list[dict] = []
        actor_id = str(request.user.id)

        for raw_id in ids:
            g = found.get(str(raw_id))
            if g is None:
                skipped.append({"id": str(raw_id), "reason": "not_found"})
                continue
            try:
                if action == "void":
                    previous = g.entry_status
                    if g.entry_status != "voided":
                        g.entry_status = "voided"
                        g.save(update_fields=["entry_status", "updated_at"])
                    write_audit(
                        organization=g.organization, event=g.event, guest=g,
                        actor_type="user", actor_id=actor_id, action="guest.voided",
                        result="success", previous_status=previous, new_status="voided",
                    )
                    done += 1
                elif action == "resend_qr":
                    if g.guest_type != "pre_registered":
                        skipped.append({"id": str(g.id), "reason": "walk_in"})
                        continue
                    if not g.email:
                        skipped.append({"id": str(g.id), "reason": "no_email"})
                        continue
                    send_qr_email_task.delay(guest_id=str(g.id))
                    done += 1
                else:  # delete
                    if AuditEvent.objects.filter(guest=g).exists():
                        skipped.append({"id": str(g.id), "reason": "has_history"})
                        continue
                    with transaction.atomic():
                        write_audit(
                            organization=g.organization, event=g.event,
                            actor_type="user", actor_id=actor_id, action="guest.deleted",
                            result="success",
                            details={"guest_id": str(g.id), "full_name": g.full_name, "email": g.email},
                        )
                        g.delete()
                    done += 1
            except Exception as exc:  # noqa: BLE001 — one bad row must not abort the batch
                errors.append({"id": str(g.id), "error": str(exc)})

        return Response({"action": action, "done": done, "skipped": skipped, "errors": errors})
```

- [ ] **Step 4: Add the route**

```python
# apps/guests/urls.py — import GuestBulkView, then add
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/bulk/",
        GuestBulkView.as_view(),
        name="guest-bulk",
    ),
```

- [ ] **Step 5: Run tests + full guest suite + mypy**

Run: `cd backend && POSTGRES_PORT=5442 uv run pytest tests/test_guest_bulk.py tests/test_guest_edit.py -q && uv run mypy apps config`
Expected: PASS, mypy clean.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/guests/views.py backend/apps/guests/urls.py backend/tests/test_guest_bulk.py
git commit -m "feat(guests): bulk void/resend-qr/delete endpoint"
```

---

## Task 4: Frontend hooks — `useBulkGuests` + `exportGuestsCsv`

**Files:**
- Modify: `frontend/lib/guests.ts`
- Test: `frontend/__tests__/lib/guests-bulk.test.ts` (create)

**Interfaces:**
- Produces:
  - `BulkAction = "void" | "resend_qr" | "delete"`.
  - `BulkResult = { action: BulkAction; done: number; skipped: { id: string; reason: string }[]; errors: { id: string; error: string }[] }`.
  - `useBulkGuests(orgSlug, eventSlug)` → mutation `({ action, guestIds }) => Promise<BulkResult>`, invalidates the guest list + count.
  - `exportGuestsCsv(orgSlug, eventSlug, opts: { filters?: { search?; entry_status?; guest_type?; ordering? }; ids?: string[] }) => Promise<void>` — POSTs, reads blob, triggers download.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/__tests__/lib/guests-bulk.test.ts
import { describe, expect, it } from "vitest";
import type { BulkAction, BulkResult } from "@/lib/guests";

describe("bulk types", () => {
  it("BulkResult shape", () => {
    const a: BulkAction = "void";
    const r: BulkResult = { action: a, done: 2, skipped: [{ id: "1", reason: "has_history" }], errors: [] };
    expect(r.done).toBe(2);
    expect(r.skipped[0].reason).toBe("has_history");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- guests-bulk`
Expected: FAIL — `BulkAction`/`BulkResult` not exported.

- [ ] **Step 3: Implement (append to `lib/guests.ts`)**

```ts
export type BulkAction = "void" | "resend_qr" | "delete";
export type BulkResult = {
  action: BulkAction;
  done: number;
  skipped: { id: string; reason: string }[];
  errors: { id: string; error: string }[];
};

export function useBulkGuests(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, guestIds }: { action: BulkAction; guestIds: string[] }) =>
      apiFetch<BulkResult>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/bulk/`, {
        method: "POST",
        body: JSON.stringify({ action, guest_ids: guestIds }),
      }),
    onSuccess: () => invalidateGuests(qc, orgSlug, eventSlug),
  });
}

export type ExportOpts = {
  filters?: { search?: string; entry_status?: string; guest_type?: string; ordering?: string };
  ids?: string[];
};

export async function exportGuestsCsv(
  orgSlug: string,
  eventSlug: string,
  opts: ExportOpts,
): Promise<void> {
  // Raw fetch (not apiFetch — we need the CSV blob, not JSON). Cookie-auth via credentials.
  const res = await fetch(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/export/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${eventSlug}-guests.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test + gates**

Run: `cd frontend && pnpm test -- guests-bulk && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/guests.ts frontend/__tests__/lib/guests-bulk.test.ts
git commit -m "feat(frontend): bulk-guests hook + CSV export action"
```

---

## Task 5: `BulkActionBar` component

**Files:**
- Create: `frontend/components/guests/bulk-action-bar.tsx`
- Test: `frontend/__tests__/components/bulk-action-bar.test.tsx` (create)

**Interfaces:**
- Consumes: `useBulkGuests` + `BulkResult` + `exportGuestsCsv` (Task 4); `ConfirmDialog`
  (`@/components/common/confirm-dialog`); `Button`; `notify` (`@/lib/toast`).
- Produces: `<BulkActionBar orgSlug eventSlug selectedIds onDone />` where
  `selectedIds: string[]`, `onDone: () => void` (clears selection). Renders the
  count, Void (confirm), Resend QR (confirm), Delete (confirm), "Export selected",
  and "Clear". Each bulk op runs `useBulkGuests`, toasts a `{done, skipped}`
  summary via `notify`, and calls `onDone()`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/bulk-action-bar.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/guests", () => ({
  useBulkGuests: () => ({ mutateAsync: vi.fn(), isPending: false }),
  exportGuestsCsv: vi.fn(),
}));

import { BulkActionBar } from "@/components/guests/bulk-action-bar";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("shows the selected count and bulk actions", () => {
  wrap(<BulkActionBar orgSlug="acme" eventSlug="launch" selectedIds={["a", "b"]} onDone={() => {}} />);
  expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^void$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /resend qr/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export selected/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- bulk-action-bar`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// frontend/components/guests/bulk-action-bar.tsx
"use client";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { exportGuestsCsv, useBulkGuests, type BulkAction, type BulkResult } from "@/lib/guests";
import { notify } from "@/lib/toast";

function summarize(r: BulkResult): string {
  const verb = r.action === "void" ? "Voided" : r.action === "delete" ? "Deleted" : "Queued";
  const skipped = r.skipped.length ? `; skipped ${r.skipped.length}` : "";
  return `${verb} ${r.done}${skipped}.`;
}

export function BulkActionBar({
  orgSlug, eventSlug, selectedIds, onDone,
}: {
  orgSlug: string;
  eventSlug: string;
  selectedIds: string[];
  onDone: () => void;
}) {
  const bulk = useBulkGuests(orgSlug, eventSlug);

  const run = async (action: BulkAction) => {
    try {
      const result = await bulk.mutateAsync({ action, guestIds: selectedIds });
      notify.success(summarize(result));
      onDone();
    } catch (e) {
      notify.error(e);
    }
  };

  const onExportSelected = async () => {
    try {
      await exportGuestsCsv(orgSlug, eventSlug, { ids: selectedIds });
    } catch (e) {
      notify.error(e);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
      <span className="font-medium">{selectedIds.length} selected</span>
      <ConfirmDialog
        trigger={<Button size="sm" variant="outline" disabled={bulk.isPending}>Void</Button>}
        title={`Void ${selectedIds.length} guest(s)?`}
        description="Marks them voided and removes them from active counts."
        confirmLabel="Void" destructive onConfirm={() => run("void")}
      />
      <ConfirmDialog
        trigger={<Button size="sm" variant="outline" disabled={bulk.isPending}>Resend QR</Button>}
        title={`Resend QR to ${selectedIds.length} guest(s)?`}
        description="Re-queues the QR email for pre-registered guests with an email."
        confirmLabel="Resend" destructive={false} onConfirm={() => run("resend_qr")}
      />
      <ConfirmDialog
        trigger={<Button size="sm" variant="destructive" disabled={bulk.isPending}>Delete</Button>}
        title={`Delete ${selectedIds.length} guest(s)?`}
        description="Permanently deletes guests with no activity history; others are skipped."
        confirmLabel="Delete" onConfirm={() => run("delete")}
      />
      <Button size="sm" variant="outline" onClick={onExportSelected}>Export selected</Button>
      <Button size="sm" variant="ghost" onClick={onDone}>Clear</Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test + gates**

Run: `cd frontend && pnpm test -- bulk-action-bar && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/guests/bulk-action-bar.tsx frontend/__tests__/components/bulk-action-bar.test.tsx
git commit -m "feat(frontend): bulk action bar for the guest list"
```

---

## Task 6: Wire selection + export into `GuestsTable` + final gates

**Files:**
- Modify: `frontend/components/guests/guests-table.tsx`
- Test: `frontend/__tests__/components/guests-table-bulk.test.tsx` (create)

**Interfaces:**
- Consumes: `BulkActionBar` (Task 5), `exportGuestsCsv` (Task 4).
- Produces: a leading checkbox column + a header "select all on this page" checkbox;
  `selectedIds: Set<string>` state; `<BulkActionBar>` rendered above the table when
  any are selected; an "Export CSV" button (filtered view) near the search box.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/guests-table-bulk.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/guests", () => ({
  useGuests: () => ({ data: { count: 1, results: [{ id: "g1", guest_type: "pre_registered",
    entry_status: "registered_not_arrived", info_status: "info_completed", full_name: "Ana", email: "a@x.com",
    phone_or_chat: "", custom_fields: {}, source: "", checked_in_at: null, created_at: "2026-06-01" }] }, isLoading: false }),
  useSendQrEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBulkGuests: () => ({ mutateAsync: vi.fn(), isPending: false }),
  exportGuestsCsv: vi.fn(),
  fetchTelegramLink: vi.fn(),
}));
vi.mock("@/lib/events", () => ({ useFields: () => ({ data: { results: [] } }) }));

import { GuestsTable } from "@/components/guests/guests-table";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("renders an Export CSV button and per-row select checkboxes", () => {
  wrap(<GuestsTable orgSlug="acme" eventSlug="launch" />);
  expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- guests-table-bulk`
Expected: FAIL — no Export button / no checkboxes.

- [ ] **Step 3: Implement**

Read `frontend/components/guests/guests-table.tsx` first. Apply these edits:

(a) Imports:
```tsx
import { BulkActionBar } from "@/components/guests/bulk-action-bar";
import { exportGuestsCsv, fetchTelegramLink, useGuests, useSendQrEmail, type Guest } from "@/lib/guests";
```

(b) Selection state (with the other `useState`s, set from handlers — no `useEffect`):
```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const toggleRow = (id: string) =>
  setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
const allOnPageSelected = rows.length > 0 && rows.every((g) => selectedIds.has(g.id));
const toggleAllOnPage = () =>
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allOnPageSelected) rows.forEach((g) => next.delete(g.id));
    else rows.forEach((g) => next.add(g.id));
    return next;
  });
const clearSelection = () => setSelectedIds(new Set());
```
(Place `allOnPageSelected`/`toggleAllOnPage` AFTER `rows` is computed.)

(c) An "Export CSV" button next to the search input (exports the filtered view):
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() =>
    exportGuestsCsv(orgSlug, eventSlug, {
      filters: { search, entry_status: entryStatus, guest_type: guestType, ordering },
    }).catch((e) => notify.error(e))
  }
>
  Export CSV
</Button>
```

(d) Render the bulk bar above the table (inside the `{rows.length > 0 && (<>` block, before `<div className="overflow-x-auto">`):
```tsx
{selectedIds.size > 0 && (
  <BulkActionBar
    orgSlug={orgSlug}
    eventSlug={eventSlug}
    selectedIds={[...selectedIds]}
    onDone={clearSelection}
  />
)}
```

(e) Add a leading checkbox `<th>` (select-all) in the header row, before the "No" `<th>`:
```tsx
<th className={cn(stickyLeft, "w-8 py-2")}>
  <input type="checkbox" aria-label="Select all on page" checked={allOnPageSelected} onChange={toggleAllOnPage} />
</th>
```

(f) Add a leading checkbox `<td>` in each row, before the "No" `<td>`:
```tsx
<td className={cn(stickyLeft, "py-2")}>
  <input type="checkbox" aria-label={`Select ${g.full_name || g.email || g.id}`} checked={selectedIds.has(g.id)} onChange={() => toggleRow(g.id)} />
</td>
```

(Note: the "No"/row-number `<td>` and the select-all `<th>` both use `stickyLeft`;
keep both — the checkbox column sits left of the number. If the double sticky looks
off, it's acceptable for this slice.)

- [ ] **Step 4: Run focused test + FULL frontend gates + FULL backend suite**

Run (frontend): `cd frontend && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Run (backend): `cd backend && POSTGRES_PORT=5442 uv run pytest -q && uv run mypy apps config && uv run python manage.py makemigrations --check --dry-run`
Expected: ALL green; no pending migrations (this plan adds no models).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/guests/guests-table.tsx frontend/__tests__/components/guests-table-bulk.test.tsx
git commit -m "feat(frontend): multi-select + bulk bar + export on the guest list"
```

---

## Self-Review

- **Spec coverage:** shared selector (T1); CSV export endpoint filtered/ids (T2);
  bulk void/resend/delete with skip-reporting (T3); hooks `useBulkGuests` +
  `exportGuestsCsv` (T4); `BulkActionBar` (T5); checkbox column + select-all +
  bar + Export CSV button (T6). POST export (avoids URL-length) honored in T2/T4.
- **Placeholder scan:** none — full code for endpoints, hooks, and the new
  component; the table integration gives exact snippets + names the file to read.
- **Type consistency:** `filtered_event_guests` (T1) consumed by T2/T3;
  `BulkAction`/`BulkResult`/`ExportOpts` (T4) consumed by T5/T6; bulk skip reasons
  (`not_found`/`has_history`/`walk_in`/`no_email`) consistent backend↔summary.

## Out of scope
PDF export, bulk check-in, async export job, column-selection UI, exporting across
events (per spec).
