# List-Scaling Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search / filter / sort / pagination to the lists that lack it —
the event list and the member list — and clickable sort to the guest list, so
they stay usable as data grows.

**Architecture:** Backend adds DRF's built-in `SearchFilter`/`OrderingFilter`
(no new dependency) to the event, guest, and member list endpoints. Frontend
extends the `useEvents`/`useMembers`/`useGuests` hooks with query params and
upgrades `events-table` + `members-table` to the paginated, sortable idiom the
guest list already uses; the guest list gains clickable sort headers.
Spec: `docs/superpowers/specs/2026-06-26-core-crud-ux-design.md` (Plan B).

**Tech Stack:** Django + DRF + pytest (backend); Next.js + React + TanStack Query
+ Vitest (frontend).

## Global Constraints

- **Commit style:** single-line Conventional Commits, **NO `Co-Authored-By`** trailer.
- **No new dependency:** use `rest_framework.filters.SearchFilter` /
  `OrderingFilter` (built into DRF). Do NOT add `django-filter`.
- **Backend tests:** `docker compose up -d postgres` (offset host port if 5432 is
  taken — set `POSTGRES_PORT` and run `POSTGRES_PORT=<n> uv run pytest`) then
  `cd backend && uv run pytest -q`; `uv run mypy apps config` clean. Tests flat in
  `backend/tests/`. Auth-fixture pattern: create Organization/User/
  OrganizationMembership(role="owner")/Event, `APIClient().force_authenticate(user)`.
- **Frontend gates:** from `frontend/`, `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20`,
  then `pnpm test -- <pattern> && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`.
  If a focused vitest run OOMs in isolation, prefix `NODE_OPTIONS="--max-old-space-size=512"`.
  Avoid `useEffect`+`setState` (forbidden lint rule) — set list state from event handlers.
- **Mirror the guest-list idiom:** `frontend/components/guests/guests-table.tsx`
  already implements search + filter + pagination + a localStorage page-size
  helper (`PAGE_SIZES=[25,50,100]`, key `"guests.pageSize"`); replicate it for
  events (key `"events.pageSize"`) and members (key `"members.pageSize"`).
- **`StandardPagination`** (`apps/orgs/views.py`): page_size 25, `page_size`
  query param, max 100. Already applied on all three list endpoints.
- **Existing query keys:** events `["events", orgSlug]`; members `["orgs", slug, "members"]`;
  guests `["guests", orgSlug, eventSlug, …]`. Extend keys with the new params so
  changing a param refetches.

---

## Task 1: Event list — backend search + ordering

**Files:**
- Modify: `backend/apps/events/views.py` (`EventViewSet`)
- Test: `backend/tests/test_event_list_filters.py` (create)

**Interfaces:**
- Produces: `GET /api/v1/orgs/<org>/events/?search=<q>` filters by event name;
  `?ordering=<field>` sorts by one of `starts_at|name|status|created_at` (and the
  `-` descending forms). Default order `-created_at`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_event_list_filters.py
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    Event.objects.create(organization=org, name="Alpha Gala", slug="alpha")
    Event.objects.create(organization=org, name="Beta Bash", slug="beta")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org


def url(org):
    return f"/api/v1/orgs/{org.slug}/events/"


@pytest.mark.django_db
def test_event_search_by_name(setup):
    client, org = setup
    resp = client.get(url(org), {"search": "alpha"})
    assert resp.status_code == 200
    names = [e["name"] for e in resp.json()["results"]]
    assert names == ["Alpha Gala"]


@pytest.mark.django_db
def test_event_ordering_by_name(setup):
    client, org = setup
    resp = client.get(url(org), {"ordering": "name"})
    names = [e["name"] for e in resp.json()["results"]]
    assert names == ["Alpha Gala", "Beta Bash"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_event_list_filters.py -q`
Expected: FAIL — `search`/`ordering` are ignored (both events returned / default order).

- [ ] **Step 3: Add the filter backends**

```python
# apps/events/views.py — add import at top
from rest_framework import filters, status, viewsets

# EventViewSet — add these class attributes (after lookup_value_regex)
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ("name",)
    ordering_fields = ("starts_at", "name", "status", "created_at")
    ordering = ("-created_at",)
```

(Keep the existing `from rest_framework import status, viewsets` content — just add
`filters` to that import.)

- [ ] **Step 4: Run tests + mypy**

Run: `cd backend && uv run pytest tests/test_event_list_filters.py -q && uv run mypy apps config`
Expected: PASS, mypy clean.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/events/views.py backend/tests/test_event_list_filters.py
git commit -m "feat(events): search + ordering on the event list endpoint"
```

---

## Task 2: Guest list — backend ordering

**Files:**
- Modify: `backend/apps/guests/views.py` (`GuestListView`)
- Test: `backend/tests/test_guest_list_ordering.py` (create)

**Interfaces:**
- Produces: `GET …/guests/?ordering=<field>` sorts by one of
  `full_name|email|created_at|entry_status|checked_in_at`. Existing search /
  entry_status / guest_type filters and the default `-created_at` order are unchanged.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_guest_list_ordering.py
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         entry_token="t1", full_name="Zara")
    Guest.objects.create(organization=org, event=event, guest_type="pre_registered",
                         entry_token="t2", full_name="Ana")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event


@pytest.mark.django_db
def test_guest_ordering_by_name(setup):
    client, org, event = setup
    resp = client.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/", {"ordering": "full_name"})
    assert resp.status_code == 200
    names = [g["full_name"] for g in resp.json()["results"]]
    assert names == ["Ana", "Zara"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_guest_list_ordering.py -q`
Expected: FAIL — `ordering` ignored; order stays `-created_at` (Zara, then Ana).

- [ ] **Step 3: Add OrderingFilter**

`GuestListView` already does `self.filter_queryset(self.get_queryset())` in `list`.
Add the ordering backend:

```python
# apps/guests/views.py — add `filters` to the rest_framework import:
from rest_framework import filters, status, viewsets

# GuestListView — add these class attributes (after pagination_class / permission_classes)
    filter_backends = (filters.OrderingFilter,)
    ordering_fields = ("full_name", "email", "created_at", "entry_status", "checked_in_at")
```

(Search/entry_status/guest_type stay hand-rolled in `get_queryset`; the model
default `-created_at` applies when no `?ordering=` is given.)

- [ ] **Step 4: Run test + full guest suite + mypy**

Run: `cd backend && uv run pytest tests/test_guest_list_ordering.py tests/test_guest_edit.py -q && uv run mypy apps config`
Expected: PASS (no regression to the existing guest behavior), mypy clean.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/guests/views.py backend/tests/test_guest_list_ordering.py
git commit -m "feat(guests): ordering on the guest list endpoint"
```

---

## Task 3: Member list — backend ordering

**Files:**
- Modify: `backend/apps/orgs/views.py` (`OrgMembersListView`)
- Test: `backend/tests/test_member_list_ordering.py` (create)

**Interfaces:**
- Produces: `GET /api/v1/orgs/<org>/members/?ordering=<field>` sorts by one of
  `user__email|role|created_at`. Default order unchanged (model default).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_member_list_ordering.py
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    owner = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=owner, role="owner")
    zoe = User.objects.create_user(email="zoe@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=zoe, role="admin")
    ana = User.objects.create_user(email="ana@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=ana, role="staff")
    client = APIClient()
    client.force_authenticate(user=owner)
    return client, org


@pytest.mark.django_db
def test_member_ordering_by_email(setup):
    client, org = setup
    resp = client.get(f"/api/v1/orgs/{org.slug}/members/", {"ordering": "user__email"})
    assert resp.status_code == 200
    emails = [m["user_email"] for m in resp.json()["results"]]
    assert emails == sorted(emails)
```

- [ ] **Step 2: Run test to verify it fails (or passes only by luck)**

Run: `cd backend && uv run pytest tests/test_member_list_ordering.py -q`
Expected: FAIL — `ordering` ignored; emails not guaranteed sorted.

- [ ] **Step 3: Add OrderingFilter**

```python
# apps/orgs/views.py — ensure `filters` is imported from rest_framework, e.g.:
from rest_framework import filters, mixins, viewsets

# OrgMembersListView — add (after pagination_class / serializer_class)
    filter_backends = (filters.OrderingFilter,)
    ordering_fields = ("user__email", "role", "created_at")
```

(`MembershipSerializer` exposes `user_email`; the ordering field uses the ORM path
`user__email`. Confirm `OrganizationMembership` has a `created_at`/`accepted_at`
field — use whichever exists; if only `accepted_at`, use that in `ordering_fields`.)

- [ ] **Step 4: Run test + mypy**

Run: `cd backend && uv run pytest tests/test_member_list_ordering.py -q && uv run mypy apps config`
Expected: PASS, mypy clean.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/orgs/views.py backend/tests/test_member_list_ordering.py
git commit -m "feat(orgs): ordering on the member list endpoint"
```

---

## Task 4: Frontend hooks — params for events / members / guests-ordering

**Files:**
- Modify: `frontend/lib/events.ts` (`useEvents`)
- Modify: `frontend/lib/orgs.ts` (`useMembers`)
- Modify: `frontend/lib/guests.ts` (`useGuests` — add `ordering`)
- Test: `frontend/__tests__/lib/list-hooks.test.ts` (create)

**Interfaces:**
- Produces:
  - `useEvents(orgSlug, filters?: { search?: string; ordering?: string; page?: number; pageSize?: number })` → `Paginated<Event>`.
  - `useMembers(slug, filters?: { ordering?: string; page?: number; pageSize?: number })` → `Paginated<Member>`.
  - `useGuests`'s `GuestFilters` gains `ordering?: string` (threaded into the query key + `ordering` param).
  - Exported types `EventListFilters`, `MemberListFilters`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/__tests__/lib/list-hooks.test.ts
import { describe, expect, it } from "vitest";
import type { EventListFilters } from "@/lib/events";
import type { MemberListFilters } from "@/lib/orgs";
import type { GuestFilters } from "@/lib/guests";

describe("list filter types", () => {
  it("event/member/guest filters carry pagination + ordering", () => {
    const e: EventListFilters = { search: "x", ordering: "name", page: 2, pageSize: 50 };
    const m: MemberListFilters = { ordering: "user__email", page: 1, pageSize: 25 };
    const g: GuestFilters = { ordering: "full_name" };
    expect([e.ordering, m.ordering, g.ordering]).toEqual(["name", "user__email", "full_name"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- list-hooks`
Expected: FAIL — `EventListFilters`/`MemberListFilters` not exported; `GuestFilters.ordering` missing.

- [ ] **Step 3: Implement**

```ts
// frontend/lib/events.ts — replace useEvents
export type EventListFilters = { search?: string; ordering?: string; page?: number; pageSize?: number };

export function useEvents(orgSlug: string, filters: EventListFilters = {}) {
  const { search = "", ordering = "", page = 1, pageSize = 25 } = filters;
  return useQuery({
    queryKey: ["events", orgSlug, search, ordering, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search) params.set("search", search);
      if (ordering) params.set("ordering", ordering);
      return apiFetch<Paginated<Event>>(`/api/v1/orgs/${orgSlug}/events/?${params.toString()}`);
    },
    enabled: !!orgSlug,
  });
}
```

```ts
// frontend/lib/orgs.ts — replace useMembers
export type MemberListFilters = { ordering?: string; page?: number; pageSize?: number };

export function useMembers(slug: string, filters: MemberListFilters = {}) {
  const { ordering = "", page = 1, pageSize = 25 } = filters;
  return useQuery({
    queryKey: ["orgs", slug, "members", ordering, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (ordering) params.set("ordering", ordering);
      return apiFetch<Paginated<Member>>(`/api/v1/orgs/${slug}/members/?${params.toString()}`);
    },
    enabled: !!slug,
  });
}
```

```ts
// frontend/lib/guests.ts — extend GuestFilters + useGuests
// add `ordering?: string;` to the GuestFilters type, then in useGuests:
//   destructure `ordering = ""`, add it to the queryKey array, and:
//   if (ordering) params.set("ordering", ordering);
```

(Apply the `useGuests` change by editing the existing hook: add `ordering` to the
`GuestFilters` type, to the destructure defaults, to the `queryKey` array, and a
`params.set("ordering", ordering)` guarded line — mirroring the existing `search` handling.)

- [ ] **Step 4: Run test + typecheck + gates**

Run: `cd frontend && pnpm test -- list-hooks && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/events.ts frontend/lib/orgs.ts frontend/lib/guests.ts frontend/__tests__/lib/list-hooks.test.ts
git commit -m "feat(frontend): list filter/sort/pagination params for events/members/guests hooks"
```

---

## Task 5: `EventsTable` — search + status filter + sort + pagination

**Files:**
- Modify: `frontend/components/events/events-table.tsx`
- Test: `frontend/__tests__/components/events-table.test.tsx` (create)

**Interfaces:**
- Consumes: `useEvents(orgSlug, filters)` (Task 4); `Input`, `Button`,
  `SegmentedControl` (`@/components/ui/segmented-control`), `Card`/`CardContent`/
  `CardHeader`/`CardTitle`, `Badge`, `EmptyState`, `TableSkeleton`. Mirror the
  guest-table pagination idiom.
- Produces: a searchable (by name), status-filterable, name/date-sortable,
  paginated event list. List state held in `useState` (set from input/click
  handlers — no `useEffect`). Page-size persisted to localStorage key `"events.pageSize"`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/events-table.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({
  useEvents: () => ({
    data: { count: 1, results: [{ id: "1", name: "Alpha Gala", slug: "alpha", status: "draft",
      starts_at: null, ends_at: null, timezone: "", venue: "", registration_open: true,
      walkins_enabled: true, walkin_capacity: 0, created_at: "2026-06-01", description: "", banner_image: null }] },
    isLoading: false,
  }),
}));

import { EventsTable } from "@/components/events/events-table";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("renders a search box and the event rows", () => {
  wrap(<EventsTable orgSlug="acme" />);
  expect(screen.getByPlaceholderText(/search events/i)).toBeInTheDocument();
  expect(screen.getByText("Alpha Gala")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- events-table`
Expected: FAIL — no search box yet.

- [ ] **Step 3: Implement**

Read `frontend/components/guests/guests-table.tsx` for the pagination/page-size
idiom, then rewrite `events-table.tsx`:

```tsx
// frontend/components/events/events-table.tsx
"use client";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { NoEvents } from "@/lib/illustrations";
import { useEvents, type EventStatus } from "@/lib/events";

const PAGE_SIZES = [25, 50, 100];
const PAGE_SIZE_KEY = "events.pageSize";
function loadPageSize(): number {
  if (typeof window === "undefined") return PAGE_SIZES[0];
  const saved = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
  return PAGE_SIZES.includes(saved) ? saved : PAGE_SIZES[0];
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "live", label: "Live" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
];

function eventStatusVariant(s: EventStatus) {
  return s === "live" ? "default" : s === "archived" ? "outline" : "secondary";
}

export function EventsTable({ orgSlug }: { orgSlug: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [ordering, setOrdering] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);

  // Status is a client-side filter over the page (backend has no ?status= param);
  // search/ordering/pagination are server-driven.
  const { data, isLoading } = useEvents(orgSlug, { search, ordering, page, pageSize });
  const all = data?.results ?? [];
  const events = status ? all.filter((e) => e.status === status) : all;
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const onSearch = (v: string) => { setSearch(v); setPage(1); };
  const onPageSize = (n: number) => {
    setPageSize(n); setPage(1);
    if (typeof window !== "undefined") window.localStorage.setItem(PAGE_SIZE_KEY, String(n));
  };
  const toggleSort = (field: string) =>
    setOrdering((o) => (o === field ? `-${field}` : field));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Events
          <Link href={`/orgs/${orgSlug}/events/new`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            New event
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input placeholder="Search events…" value={search} onChange={(e) => onSearch(e.target.value)} className="max-w-xs" />
          <SegmentedControl value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_FILTERS} />
        </div>
        {isLoading && <TableSkeleton />}
        {!isLoading && events.length === 0 && (
          <EmptyState illustration={NoEvents} title="No events" message="Adjust your search or create an event." />
        )}
        {events.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-left font-normal">
                  <button type="button" className="hover:underline" onClick={() => toggleSort("name")}>Name</button>
                </th>
                <th className="py-2 text-left font-normal">
                  <button type="button" className="hover:underline" onClick={() => toggleSort("starts_at")}>Date</button>
                </th>
                <th className="py-2 text-left font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-2">
                    <Link href={`/orgs/${orgSlug}/events/${e.slug}`} className="hover:underline">{e.name}</Link>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {e.starts_at ? new Date(e.starts_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2"><Badge variant={eventStatusVariant(e.status)}>{e.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <label htmlFor="ev-page-size" className="text-muted-foreground">Rows per page</label>
            <Select id="ev-page-size" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="w-auto">
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

> NOTE: confirm `SegmentedControl`'s prop names (`value`/`onValueChange`/`options`)
> against `frontend/components/ui/segmented-control.tsx` and how `guests-table.tsx`
> calls it — match that exact API (adjust if it differs). Confirm `Select` is the
> project's `@/components/ui/select`. The backend has no `?status=` param, so status
> is filtered client-side over the current page (documented in the code comment) —
> acceptable at pilot scale; a server-side status filter is a future enhancement.

- [ ] **Step 4: Run test + gates**

Run: `cd frontend && pnpm test -- events-table && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/events/events-table.tsx frontend/__tests__/components/events-table.test.tsx
git commit -m "feat(frontend): searchable/sortable/paginated events table"
```

---

## Task 6: `MembersTable` — pagination + sortable headers

**Files:**
- Modify: `frontend/components/orgs/members-table.tsx`
- Test: `frontend/__tests__/components/members-table-paging.test.tsx` (create)

**Interfaces:**
- Consumes: `useMembers(slug, { ordering, page, pageSize })` (Task 4).
- Produces: the member list gains pagination controls (mirroring events/guests)
  and clickable Email/Role/Joined sort headers driving `ordering`. Page size
  persisted to `"members.pageSize"`. List state from handlers (no `useEffect`).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/members-table-paging.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/orgs", () => ({
  useMembers: () => ({ data: { count: 1, results: [{ id: "m1", user_email: "a@x.com", role: "admin", accepted_at: "2026-06-01" }] } }),
  useMe: () => ({ data: { email: "owner@x.com" } }),
  useUpdateMemberRole: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: vi.fn(), isPending: false }),
  useInviteMember: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useInvites: () => ({ data: { results: [] } }),
  useCancelInvite: () => ({ mutate: vi.fn() }),
}));

import { MembersTable } from "@/components/orgs/members-table";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("shows pagination controls", () => {
  wrap(<MembersTable slug="acme" />);
  expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  expect(screen.getByText(/rows per page/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- members-table-paging`
Expected: FAIL — no pagination controls.

- [ ] **Step 3: Implement**

Read `frontend/components/orgs/members-table.tsx` and the guest-table pagination
idiom first. The component's exact hook names + props differ from the test mock
above — **mirror the real hooks** (the mock is illustrative; match the actual
`@/lib/orgs` exports the component already imports). Apply:

(a) Add the page-size helper + state (no `useEffect`):
```tsx
const PAGE_SIZES = [25, 50, 100];
const PAGE_SIZE_KEY = "members.pageSize";
function loadPageSize(): number {
  if (typeof window === "undefined") return PAGE_SIZES[0];
  const saved = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
  return PAGE_SIZES.includes(saved) ? saved : PAGE_SIZES[0];
}
// in the component:
const [ordering, setOrdering] = useState("user__email");
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(loadPageSize);
const toggleSort = (field: string) => setOrdering((o) => (o === field ? `-${field}` : field));
```

(b) Pass them to the members query: change the `useMembers(slug)` call to
`useMembers(slug, { ordering, page, pageSize })`.

(c) Make the Email/Role/Joined `<th>`s clickable buttons calling
`toggleSort("user__email")` / `toggleSort("role")` / `toggleSort("accepted_at")`.

(d) After the members `<table>`, render the same pagination block as the events
table (Rows-per-page `Select` + Previous / "Page X of Y" / Next using
`members.data.count` and `pageSize`), with `onPageSize` writing
`window.localStorage.setItem("members.pageSize", …)` and resetting page to 1.

- [ ] **Step 4: Run test + full suite + gates**

Run: `cd frontend && pnpm test -- members-table && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/orgs/members-table.tsx frontend/__tests__/components/members-table-paging.test.tsx
git commit -m "feat(frontend): paginated + sortable members table"
```

---

## Task 7: `GuestsTable` — clickable sort headers + final gates

**Files:**
- Modify: `frontend/components/guests/guests-table.tsx`
- Test: `frontend/__tests__/components/guests-table-sort.test.tsx` (create)

**Interfaces:**
- Consumes: `useGuests(orgSlug, eventSlug, { …, ordering })` (Task 4).
- Produces: the guest list's static name/email/registered headers become
  clickable buttons that toggle `ordering` (asc/desc) and pass it to `useGuests`.
  State from handlers (no `useEffect`).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/guests-table-sort.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/guests", () => ({
  useGuests: () => ({ data: { count: 1, results: [{ id: "g1", guest_type: "pre_registered",
    entry_status: "registered_not_arrived", info_status: "info_completed", full_name: "Ana",
    email: "ana@x.com", phone_or_chat: "", custom_fields: {}, source: "", checked_in_at: null, created_at: "2026-06-01" }] }, isLoading: false }),
  useSendQrEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  fetchTelegramLink: vi.fn(),
}));
vi.mock("@/lib/events", () => ({ useFields: () => ({ data: { results: [] } }) }));

import { GuestsTable } from "@/components/guests/guests-table";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("renders a clickable Registered sort header", () => {
  wrap(<GuestsTable orgSlug="acme" eventSlug="launch" />);
  expect(screen.getByRole("button", { name: /registered/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- guests-table-sort`
Expected: FAIL — the "Registered" header is static text, not a button.

- [ ] **Step 3: Implement**

Read `frontend/components/guests/guests-table.tsx`. Add ordering state + pass it
to `useGuests`, and make the static headers clickable:

(a) Add state (with the other `useState`s):
```tsx
const [ordering, setOrdering] = useState("-created_at");
const toggleSort = (field: string) => { setOrdering((o) => (o === field ? `-${field}` : field)); setPage(1); };
```

(b) Pass `ordering` into the existing `useGuests(orgSlug, eventSlug, { … })` call
(add `ordering` to the filters object alongside search/page/pageSize/entryStatus/guestType).

(c) Convert the `Type` / `Entry` / `Registered` `<th>` labels into buttons (keep
the dynamic registration-field columns as-is — they aren't sortable server-side):
```tsx
<th className="py-2 text-left font-normal">
  <button type="button" className="hover:underline" onClick={() => toggleSort("entry_status")}>Entry</button>
</th>
<th className="py-2 text-left font-normal">
  <button type="button" className="hover:underline" onClick={() => toggleSort("created_at")}>Registered</button>
</th>
```
(`Type` has no backend ordering field — leave it static. Use `full_name`/`email`
fields only if those columns exist; here the sortable server fields are
`entry_status` and `created_at`, which map to the Entry and Registered columns.)

- [ ] **Step 4: Run test + FULL backend & frontend suites + gates**

Run (frontend): `cd frontend && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Run (backend): `cd backend && uv run pytest -q && uv run mypy apps config && uv run python manage.py makemigrations --check --dry-run`
Expected: ALL green; no pending migrations (this plan adds no models).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/guests/guests-table.tsx frontend/__tests__/components/guests-table-sort.test.tsx
git commit -m "feat(frontend): clickable sort headers on the guest list"
```

---

## Self-Review

- **Spec coverage (Plan B):** event-list search/ordering backend (T1) + UI
  search/filter/sort/pagination (T5); guest-list ordering backend (T2) + clickable
  sort headers (T7); member-list ordering backend (T3) + pagination/sort UI (T6);
  hooks plumbing (T4). Event-list pagination UI = T5; member pagination = T6.
- **Placeholder scan:** none — full code for backend filter attrs, hooks, and the
  events-table rewrite; member/guest table edits give exact snippets + name the
  file to read for placement. Two NOTEs flag primitive-API confirmations
  (SegmentedControl/Select props; real `@/lib/orgs` hook names) — these are
  verify-then-match, not unfilled blanks.
- **Type consistency:** `EventListFilters`/`MemberListFilters` (T4) consumed by
  T5/T6; `GuestFilters.ordering` (T4) consumed by T7; `ordering`/`page`/`pageSize`
  param names + localStorage keys (`events.pageSize`/`members.pageSize`) consistent.

## Out of scope
Server-side event status filter (status is filtered client-side over the current
page — noted in T5); member search box; saved/shareable sort state in the URL;
anything from later phases.
