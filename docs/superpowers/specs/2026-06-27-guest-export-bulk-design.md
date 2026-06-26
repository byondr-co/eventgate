# Guest Export + Bulk Actions — Design

> **Program context:** Eventgate v2 uplift, slate item #3 (pilot-requested). Builds
> directly on the guest list shipped in Core CRUD (#85/#88) + list-scaling (#89):
> the list already has search/filter/sort/pagination + per-row edit/void/delete.
> This adds **CSV export** of the list and **multi-select bulk actions**.

**Goal:** Let an organizer export the (filtered) guest list to CSV and act on many
guests at once — bulk void, bulk resend-QR, bulk delete, and export-selected —
from a multi-select toolbar on the guest list.

## Decisions locked during brainstorming

1. **Export = CSV only**, server-generated, respecting the **current filtered view**
   (search / entry_status / guest_type / ordering), unpaginated. PDF is out of scope.
2. **Bulk actions = Void + Resend QR + Delete + Export-selected** (all four).
3. **Server-side export** (a backend endpoint re-applies filters and streams all
   matching rows) — NOT client-side CSV (which would only see the current page).
4. **One bulk endpoint** with an `action` param returning a `{done, skipped, errors}`
   summary — NOT N single-row calls from the client.
5. **Sync** export + bulk (fine at pilot scale, ~hundreds of guests) — no async job.

## Current state (verified 2026-06-27)

- No export or download endpoint exists anywhere; no PDF/spreadsheet lib in
  `backend/pyproject.toml` (stdlib `csv` only).
- `GuestListView` (`backend/apps/guests/views.py`) filters by `search` /
  `entry_status` / `guest_type` in `get_queryset` and applies `OrderingFilter`
  (`?ordering=`); paginates via `StandardPagination`.
- Per-row guest ops already exist (PR #85): `PATCH`/`DELETE` `…/guests/<id>/`,
  `POST …/guests/<id>/void/`, `POST …/guests/<id>/send-qr-email/`. Delete is
  guarded — refused (409) when the guest has audit rows.
- `Guest` has `full_name`, `email`, `phone_or_chat`, `custom_fields` (JSON),
  `guest_type`, `entry_status`, `checked_in_at`, `created_at`. Non-preset
  registration fields define the custom columns (`PRESET_FIELDS = {"name",
  "email", "phone_or_chat"}` in `apps/guests/services.py`).
- Frontend guest list = `components/guests/guests-table.tsx` (search box, type/entry
  SegmentedControls, sortable headers, pagination, per-row Edit→drawer). `useGuests`
  takes `{search, page, pageSize, entryStatus, guestType, ordering}`.

## Architecture

Two new backend endpoints + a frontend multi-select layer over the existing table.

### Backend — shared guest filtering

Extract the `get_queryset` filter logic (search/entry_status/guest_type) into a
reusable helper so the list view, the export view, and the bulk view all scope
identically:

```python
# apps/guests/services.py (or a small selectors module)
def filtered_event_guests(*, organization, event_slug, params) -> QuerySet[Guest]:
    """Org/event-scoped guests with the list's search/entry_status/guest_type
    filters applied (same semantics as GuestListView.get_queryset)."""
```

`GuestListView.get_queryset` is refactored to call this (no behavior change;
covered by existing guest-list tests).

### Backend — export endpoint

`POST /api/v1/orgs/<org>/events/<event>/guests/export/`
- **POST, not GET** — "export selected" can carry ~hundreds of UUIDs, which would
  blow past URL-length limits in a `?ids=` query string. The frontend fetches the
  CSV as a blob (no browser navigation), so POST-for-download is fine and unifies
  both cases.
- Perm: `IsAuthenticated, IsOrgMember` (read — any member, like the list).
- Body: `{"filters"?: {"search"?, "entry_status"?, "guest_type"?, "ordering"?},
  "ids"?: [<uuid>, …]}`. With `ids`, restrict to those (scoped to the org/event;
  foreign/unknown ids ignored). Without `ids`, apply `filtered_event_guests(...)`
  using `filters` (+ `ordering`, default `-created_at`). **No pagination.**
- Columns (header row uses human labels):
  `Name, Email, Phone/Chat, <each non-preset registration field label…>, Type,
  Entry status, Checked in at, Registered at`.
  Custom-field values read from `guest.custom_fields[field_key]`.
- Streams via `StreamingHttpResponse` (stdlib `csv` writing into a generator) with
  `Content-Type: text/csv` and
  `Content-Disposition: attachment; filename="<event-slug>-guests.csv"`.
- 0 matching rows → header-only CSV (200), not an error.

### Backend — bulk endpoint

`POST /api/v1/orgs/<org>/events/<event>/guests/bulk/`
- Perm: `IsAuthenticated, IsOrgMember, HasOrgRole(owner, admin, manager)`.
- Body: `{"action": "void" | "resend_qr" | "delete", "guest_ids": [<uuid>, …]}`.
- Resolves the ids scoped to the org/event; ids that don't resolve are reported
  in `skipped` (reason `"not_found"`). For each resolved guest, runs the SAME
  logic as the single-row op:
  - `void` → set `entry_status="voided"` (idempotent) + `guest.voided` audit.
  - `resend_qr` → queue the QR email if pre-registered **and** has an email; else
    `skipped` (reason `"no_email"` / `"walk_in"`).
  - `delete` → hard-delete only if the guest has **no audit rows**; else `skipped`
    (reason `"has_history"`). On delete, write `guest.deleted` (guest=None) first.
- Returns `200 {"action", "done": <int>, "skipped": [{"id","reason"}], "errors": []}`.
- Whole thing wrapped so a single bad item doesn't abort the batch (per-item
  try/except → `errors`).

### Frontend

- **`components/guests/bulk-action-bar.tsx`** (new): given `selectedIds` + counts,
  renders the action toolbar — Void / Resend QR / Delete (each via `ConfirmDialog`),
  Export selected, a selected-count, and Clear. Calls `useBulkGuests` then toasts
  the `{done, skipped}` summary; closes/clears on success.
- **`guests-table.tsx`**: add a leading checkbox column + a header "select all on
  this page" checkbox; `selectedIds: Set<string>` state (from row toggles — no
  `useEffect`). Render `<BulkActionBar>` above the table when `selectedIds.size > 0`.
  Add an **"Export CSV"** button by the search/filter controls (exports the
  filtered view).
- **Hooks** (`lib/guests.ts`):
  - `useBulkGuests(orgSlug, eventSlug)` → `POST …/guests/bulk/`, invalidates the
    guest list + count.
  - `exportGuestsCsv(orgSlug, eventSlug, opts)` — `POST`s `{filters}` or `{ids}`
    to the export endpoint, reads the CSV response as a blob, and triggers a
    browser download (anchor + object URL). Not a TanStack query (it's an action).

## Error handling

- Bulk: per-item failures captured in `errors`/`skipped`; the toast summarizes
  ("Voided 8; skipped 2 (have history)"). Empty selection → toolbar disabled.
- Export: a non-200 surfaces `toast.error(extractApiError)`; 0 rows → header-only file.
- Delete guard reused verbatim from the single-row path (append-only audit).

## Testing

**Backend (pytest):**
- `filtered_event_guests` parity (search/entry/type) — and `GuestListView` still
  green (refactor regression).
- Export (POST): correct columns incl. a custom registration field; respects
  `filters` (search/entry_status/ordering) in the body; `ids` subset; the
  `Content-Disposition: attachment` header; 0-row header-only CSV.
- Bulk: `void` (voided + audit, idempotent), `delete` (no-history deleted,
  history-having **skipped** with reason, audit `guest.deleted` guest=None),
  `resend_qr` (pre-reg+email queued, walk-in/no-email skipped); summary shape;
  role-gating (manager allowed, staff/anon denied); foreign id → skipped not_found.

**Frontend (vitest + RTL):**
- Row checkbox + select-all toggles `selectedIds`; toolbar appears only when ≥1.
- Bulk buttons call `useBulkGuests` with the right `{action, guest_ids}`; confirm
  dialogs gate destructive ones.
- "Export CSV" + "Export selected" invoke `exportGuestsCsv` with the right opts.

No automated Playwright e2e (CI e2e has no backend) — Docker-stack manual check.

## Out of scope

PDF export, bulk check-in / status transitions, scheduled or async export jobs,
saved exports, column selection UI, exporting across multiple events.
