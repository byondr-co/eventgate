# Core CRUD/UX Gaps — Design (Eventgate v2 Uplift, slice 2)

> **Program context:** Post-pilot top priority is the "Eventgate v2 uplift" UX
> program (pilot retro 2026-06-19: organizers found the system too technical;
> usability > revenue). Slice 1 = the Event Setup Wizard (shipped #82). This is
> **slice 2 — Core CRUD/UX gaps** (slate item #2,
> `docs/plans/2026-06-11-phase2-candidate-slate.md`).

**Goal:** Give a non-technical organizer the corrective day-to-day operations
that are currently impossible without database access — edit and delete events
and guests — plus the list-management affordances (search/filter/sort/
pagination) that the event and member lists still lack.

## Decisions locked during brainstorming

1. **Scope** = edit + delete for **Events** and **Guests**, plus **list-scaling**
   (event-list search/filter/sort/pagination UI, member-list pagination, guest
   sort). Bulk actions, export, event clone, guest detail/history page, and org
   delete are **out** (later slices).
2. **Removal model = void / archive, with hard-delete only when safe.**
   *Refined during planning:* the audit log is append-only (a `BEFORE UPDATE OR
   DELETE` trigger, `apps/audit/migrations/0002`) and `audit.event` is `PROTECT`
   while `audit.guest` is `SET_NULL` — so any event or guest that has audit
   history **cannot** be hard-deleted (the delete/SET_NULL trips the trigger or
   PROTECT). Therefore:
   - **Guests:** the primary "remove" action is **Void** (`entry_status =
     voided`) — soft, audit-preserving, already modeled, and already treated as
     "non-voided" by capacity logic. A true **hard-delete** is offered only when
     the guest has **no audit history**.
   - **Events:** the primary action is **Archive** (existing `archived` status).
     A true **hard-delete** is allowed only when the event has **no guests AND no
     audit history** (covers "I made a test event by mistake").
3. **Slug is editable**, with an **auto-redirect** so old links keep working.
4. **Guest edit UX = a slide-over drawer** opened from a guest row (no standalone
   guest detail page this slice).

## Implementation splits into two plans

The two halves are independent; Plan A is higher organizer-pain, so it ships
first.

- **Plan A — Corrective CRUD:** event edit + slug rename/alias, event delete,
  guest edit + delete (drawer).
- **Plan B — List-scaling:** event-list search/filter/sort/pagination UI,
  member-list pagination, guest-list sort.

---

## Current state (verified 2026-06-26)

- **Events:** `EventViewSet` (`backend/apps/events/views.py:25`) supports
  list/retrieve/create/update/destroy + a `transition` action. PATCH currently
  only accepts `walkin_capacity`, `walkins_enabled`, `venue`, `description`,
  `registration_open`; name/slug/timezone/dates are effectively immutable.
  `destroy` exists but is not exposed in the UI. List has no search/order params.
  Frontend `events-table.tsx` is a plain card list with no search/filter/sort and
  no visible pagination controls (backend already paginates via
  `StandardPagination`).
- **Guests:** `GuestListView` (`backend/apps/guests/views.py:78`) already supports
  `?search=`, `?entry_status=`, `?guest_type=`, and pagination; `GuestSerializer`
  is **read-only** and there is **no** single-guest retrieve/update/delete
  endpoint. List ordering is hard-coded `-created_at` (no `?ordering=`). Frontend
  `guests-table.tsx` has search + filters + pagination but **no sortable columns**
  and no edit/delete affordance.
- **Members:** full CRUD works (invite/role/remove); the list paginates on the
  backend but the frontend shows no pagination controls.
- **Short links:** `ShortUrl` (`backend/apps/shorturls/models.py`) maps
  `short_code → target_url`, CASCADE on event. The auto-create signal
  (`backend/apps/shorturls/signals.py:13`) fires **only on event create**, so a
  later slug change leaves `target_url` pointing at the old slug.
- **QR codes:** encode the guest `entry_token`, not a URL
  (`backend/apps/guests/tasks.py:43`). **Renaming an event slug never breaks a
  guest's QR.**
- **Audit:** `write_audit` helper + audit list view already exist and are the
  established way to record actions.

---

## Plan A — Corrective CRUD

### Backend — Events

**Editable fields.** Widen `EventSerializer`/`EventViewSet.update` writable set to:
`name`, `slug`, `starts_at`, `ends_at`, `timezone`, `venue`, `walkin_capacity`,
`walkins_enabled`, `description`, `registration_open`.

Validation:
- `ends_at >= starts_at` (when both present).
- `slug` unique within the organization, and not colliding with another event's
  alias (see below). Reuse the create-time slug rules (same charset/length).

**Slug rename + redirect.** New model:

```
EventSlugAlias
  id            UUID pk
  organization  FK(orgs.Organization, CASCADE)
  event         FK(events.Event, CASCADE, related_name="slug_aliases")
  slug          CharField — same max_length + charset as Event.slug
  created_at    DateTimeField(default=now)
  unique_together = (organization, slug)
```

On a slug change, inside an atomic `perform_update`:
1. Create `EventSlugAlias(organization=event.org, event=event, slug=old_slug)`
   (idempotent — ignore if that alias already exists).
2. Rewrite every `ShortUrl` for the event: recompute `target_url` with the new
   slug (`…/e/<org_slug>/<new_slug>/register`) so `/r/<code>` links follow the
   rename.
3. Write an `event.updated` audit row (include the slug change).

**Public resolution.** `PublicEventDetailView`
(`backend/apps/events/views.py:136`): if no `Event` matches the requested slug,
look up `EventSlugAlias(org, slug)`; if found, resolve to its event and return
the event payload (which carries the **current** slug). The frontend public page
compares requested vs returned slug and `router.replace`s to the canonical path
(SPA-side redirect; no HTTP 3xx needed). Alias uniqueness within the org
guarantees a single resolution.

**Delete.** `EventViewSet.destroy`: permitted only when the event has **no guests
AND no audit rows** (`audit.event` is `PROTECT`, so a delete with history would
500). Otherwise return **409 Conflict** directing the organizer to Archive. On a
permitted delete, first write an `event.deleted` audit row **with `event=None`**
(passing the event would self-block via PROTECT) carrying the slug/name/id in
`details`, then delete. Restricted to `owner/admin/manager`. Archive remains the
path for events with history.

### Backend — Guests

**New `GuestDetailView`** at
`/api/v1/orgs/<org>/events/<event>/guests/<guest_id>/`:
- `GET` — return the guest with all custom registration-field values (so the
  drawer can populate every field).
- `PATCH` — editable: `full_name`, `email`, `phone_or_chat`, and custom
  registration-field values. Make these writable on the serializer (or a
  dedicated write serializer). Validate email format and event-required fields.
  **Does not** modify `entry_token` or `entry_status`. Write a `guest.updated`
  audit row with a field diff.
- **Void** (primary remove) — `POST .../guests/<id>/void/` sets
  `entry_status = "voided"` and writes a `guest.voided` audit row. Soft,
  audit-preserving, and already excluded from capacity counts. Idempotent.
- `DELETE` — true hard-delete, permitted **only when the guest has no audit
  rows** (a `SET_NULL` cascade onto append-only audit rows would trip the
  trigger). If audit rows exist → **409** directing to Void. On a permitted
  delete, write a `guest.deleted` audit row **with `guest=None`** (identity in
  `details`) then delete. Restricted to `owner/admin/manager`.

**Audit FK (verified 2026-06-26):** `audit.guest` is already `SET_NULL` and
`audit.event` is `PROTECT`; the audit table is append-only via a DB trigger.
This is what forces the void-first model above — no audit migration is needed.

**Permissions.** All guest writes: `IsAuthenticated + IsOrgMember +
HasOrgRole(owner, admin, manager)` (the existing pattern).

### Frontend — Events

- **`components/events/event-details-form.tsx`** — an "Event details" edit form
  on the existing event **Settings** page, reusing the wizard `basics-step` field
  components. Fields: name, slug, dates, timezone, venue, capacity, description.
  On a successful slug change, `router.replace` to the new slug path and toast
  "Saved — your links now point here."
- **Event delete** — a destructive button on Settings, disabled with an
  explanatory tooltip when `guest_count > 0`; behind a `ConfirmDialog`. A 409
  from the API surfaces as a toast ("This event has guests — archive it
  instead"), never a success state.
- Hooks: extend `lib/events.ts` with `useUpdateEvent` (widened payload) and
  `useDeleteEvent`; invalidate the events list + event detail queries.

### Frontend — Guests

- **`components/guests/guest-edit-drawer.tsx`** — a Sheet/drawer opened by
  clicking a guest row. Contains the editable form (name/email/phone + custom
  fields), a **Save** (`useUpdateGuest`), a **Delete** (`useDeleteGuest` behind a
  confirm), and **Resend QR** (the existing inline action). Closes + invalidates
  the guest list on success.
- Hooks: `lib/guests.ts` gains `useGuest`, `useUpdateGuest`, `useDeleteGuest`.

---

## Plan B — List-scaling

### Backend

- **Events list** (`EventViewSet`): add DRF `SearchFilter` (`search_fields =
  ["name"]`) + `OrderingFilter` (`ordering_fields = ["starts_at", "name",
  "status", "created_at"]`, default `-starts_at`). Keep `StandardPagination`.
- **Guests list** (`GuestListView`): add `OrderingFilter`
  (`ordering_fields = ["full_name", "email", "created_at", "entry_status",
  "checked_in_at"]`); preserve existing search/filter/pagination and the
  `-created_at` default.
- **Members list**: confirm `StandardPagination` is applied (it is) — no new
  params required for this slice (member search/filter is out of scope).

### Frontend

- **`events-table.tsx`**: add a search box, a status filter (SegmentedControl),
  sortable column headers, and pagination controls — mirroring the existing
  `guests-table.tsx` idiom, with list state (search/filter/sort/page) held in URL
  query params.
- **`guests-table.tsx`**: make column headers clickable to drive an `ordering`
  query param.
- **`members-table.tsx`**: add the same pagination controls used elsewhere.

---

## Error handling

- Event delete with guests → **409**; frontend shows a non-destructive toast
  directing the user to Archive.
- Slug collision (with an event or an existing alias) → field-level validation
  error on the slug input.
- Guest edit validation (bad email, missing required field) → inline field
  errors.
- No optimistic updates — mutate, then invalidate + refetch (matches the existing
  TanStack Query pattern across the app).

## Testing

**Backend (pytest, TDD):**
- Event PATCH widens fields; `ends_at < starts_at` rejected.
- Slug change creates an `EventSlugAlias` and rewrites the event's `ShortUrl`
  target(s) to the new slug.
- `PublicEventDetailView` resolves an aliased (old) slug to the current event.
- Event delete: 204 when no guests + no audit history; **409** when guests exist
  or audit rows exist.
- Guest PATCH updates contact + custom fields, writes `guest.updated`, and leaves
  `entry_token`/`entry_status` unchanged.
- Guest void sets `entry_status="voided"`, writes `guest.voided`, is idempotent.
- Guest DELETE: 204 + `guest.deleted` (guest=None) when the guest has no audit
  history; **409** when audit rows exist.
- List `?search=` / `?ordering=` behave for events and guests.

**Frontend (Vitest + RTL):**
- `event-details-form` renders fields + surfaces validation errors.
- `events-table` search / status filter / sort / pagination.
- `guest-edit-drawer` save + delete + resend-QR.
- `members-table` pagination.

**Playwright (e2e):**
- Rename an event slug → an old public link resolves to the new slug.
- Delete a no-history event succeeds; an event with guests/history offers Archive.
- Edit a guest's name; void a guest; delete a no-history guest.

## Out of scope (explicit)

Bulk guest actions, event cloning, a standalone guest detail/history page,
organization delete, organization/member search & filter, and CSV/PDF export.
Each is a candidate for a later uplift or revenue slice.
