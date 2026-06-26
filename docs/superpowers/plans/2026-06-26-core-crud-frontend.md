# Core CRUD — Frontend Implementation Plan (Plan A-Frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI for the corrective CRUD backend (PR #85): edit + delete an
event on its Settings page, and edit / void / delete a guest from a drawer on the
guest list — plus a server-side redirect so a renamed event's old public link
resolves.

**Architecture:** New TanStack-Query hooks in `lib/events.ts` / `lib/guests.ts`
wrap the merged endpoints. New components — an event details edit form + a danger
zone (delete) on the Settings page, and a right-anchored `Dialog` "drawer" for
guest edit/void/delete reachable via an Edit button per guest row. The public
register page (a server component) gains a `redirect()` to the canonical slug.
Spec: `docs/superpowers/specs/2026-06-26-core-crud-ux-design.md`.

**Tech Stack:** Next.js (modified fork) + React + TypeScript + TanStack Query +
Tailwind v4 + `@base-ui/react` dialog + sonner toasts; Vitest + Testing Library.

## Global Constraints

- **Commit style:** single-line Conventional Commits, **NO `Co-Authored-By`** trailer.
- **Modified Next.js:** before writing routing/navigation code (`useRouter`,
  `redirect`, route conventions), read the relevant guide under
  `frontend/node_modules/next/dist/docs/` and heed deprecations. Do not assume
  training-data Next APIs.
- **Frontend gates (all must pass before each commit):** from `frontend/`, run
  `nvm use 20` first, then `pnpm test && pnpm exec tsc --noEmit && pnpm lint &&
  pnpm format:check`. Unit tests live in `frontend/__tests__/`.
- **Backend endpoints already merged (PR #85)** — use these exact shapes:
  - Event edit: `PATCH /api/v1/orgs/<org>/events/<slug>/` (name/slug/starts_at/
    ends_at/timezone/venue/walkin_capacity/walkins_enabled/description/registration_open).
  - Event delete: `DELETE /api/v1/orgs/<org>/events/<slug>/` → 204, or **409** when
    the event has guests or audit history.
  - Guest detail: `GET /api/v1/orgs/<org>/events/<event>/guests/<id>/` → guest.
  - Guest edit: `PATCH …/guests/<id>/` (full_name/email/phone_or_chat/custom_fields)
    → guest; never changes entry_token/entry_status.
  - Guest void: `POST …/guests/<id>/void/` → guest (entry_status="voided").
  - Guest delete: `DELETE …/guests/<id>/` → 204, or **409** when the guest has audit history.
- **Drawer = the existing `Dialog`** (`@/components/ui/dialog`) with a right-anchored
  `className` on `DialogContent`. Do NOT add a new primitive or edit
  `components/ui/dialog.tsx`. Reuse `@/components/common/confirm-dialog` (`ConfirmDialog`)
  for void/delete confirmation.
- **Toasts:** `import { toast } from "sonner"`. For a thrown `apiFetch` error,
  surface the backend message with `extractApiError(err)` from `@/lib/api` (it
  pulls `detail` out of the response body — so a 409's "…archive/void instead"
  text shows).
- **`apiFetch` behavior** (`@/lib/api`): non-2xx throws `Error("<status> <text>: <body>")`;
  204 returns `undefined`. Existing query keys: events use `["events", orgSlug]`
  and `["events", orgSlug, eventSlug]`; guests use `["guests", orgSlug, eventSlug, …]`
  and `["guests-count", orgSlug, eventSlug]` (invalidate by the `["guests", orgSlug, eventSlug]` prefix).
- **Test pattern** (mirror `frontend/__tests__/components/event-setup-wizard.test.tsx`):
  a `wrap(ui)` helper that renders inside `QueryClientProvider` (retry:false);
  `vi.mock("next/navigation", …)`; `vi.mock("@/lib/events"|"@/lib/guests", …)` to
  stub mutation hooks; set `window.matchMedia` in `beforeEach` if the component
  uses motion.

---

## Task 1: Event hooks — widen `useUpdateEvent`, add `useDeleteEvent`

**Files:**
- Modify: `frontend/lib/events.ts`
- Test: `frontend/__tests__/lib/events-hooks.test.ts` (create)

**Interfaces:**
- Produces:
  - `useUpdateEvent(orgSlug, eventSlug)` mutation accepting
    `Partial<Pick<Event, "name"|"slug"|"venue"|"description"|"walkin_capacity"|"walkins_enabled"|"registration_open"|"starts_at"|"ends_at"|"timezone">>`.
  - `useDeleteEvent(orgSlug)` mutation: `(eventSlug: string) => Promise<void>`,
    `DELETE`s the event and invalidates `["events", orgSlug]`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/__tests__/lib/events-hooks.test.ts
import { describe, expect, it } from "vitest";
import type { UpdateEventInput } from "@/lib/events";

describe("event hooks types", () => {
  it("UpdateEventInput allows the editable fields", () => {
    const input: UpdateEventInput = {
      name: "Gala", slug: "gala-2026", venue: "Hall A",
      starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-01T18:00:00Z",
      timezone: "Asia/Phnom_Penh", walkin_capacity: 100,
    };
    expect(input.slug).toBe("gala-2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- events-hooks`
Expected: FAIL — `UpdateEventInput` is not exported.

- [ ] **Step 3: Implement**

```ts
// frontend/lib/events.ts — add the exported input type ABOVE useUpdateEvent
export type UpdateEventInput = Partial<
  Pick<
    Event,
    | "name" | "slug" | "venue" | "description" | "walkin_capacity"
    | "walkins_enabled" | "registration_open" | "starts_at" | "ends_at" | "timezone"
  >
>;
```

Replace the existing `useUpdateEvent` mutationFn input type with `UpdateEventInput`:

```ts
// frontend/lib/events.ts — useUpdateEvent: change the mutationFn signature
    mutationFn: (input: UpdateEventInput) =>
      apiFetch<Event>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
```

Add `useDeleteEvent` at the end of the file:

```ts
// frontend/lib/events.ts — append
export function useDeleteEvent(orgSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventSlug: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", orgSlug] }),
  });
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `cd frontend && pnpm test -- events-hooks && pnpm exec tsc --noEmit`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/events.ts frontend/__tests__/lib/events-hooks.test.ts
git commit -m "feat(frontend): widen useUpdateEvent + add useDeleteEvent"
```

---

## Task 2: Guest hooks — `useUpdateGuest`, `useVoidGuest`, `useDeleteGuest`

**Files:**
- Modify: `frontend/lib/guests.ts`
- Test: `frontend/__tests__/lib/guests-hooks.test.ts` (create)

**Interfaces:**
- Produces (all import `useMutation, useQueryClient` — add `useQueryClient` to the
  existing `@tanstack/react-query` import in this file):
  - `useUpdateGuest(orgSlug, eventSlug)`: `({ guestId, data }: { guestId: string; data: GuestEditInput }) => Promise<Guest>`.
  - `useVoidGuest(orgSlug, eventSlug)`: `(guestId: string) => Promise<Guest>` (POST `…/void/`).
  - `useDeleteGuest(orgSlug, eventSlug)`: `(guestId: string) => Promise<void>` (DELETE).
  - `GuestEditInput = Partial<Pick<Guest, "full_name"|"email"|"phone_or_chat"|"custom_fields">>`.
  - All three invalidate `["guests", orgSlug, eventSlug]` and `["guests-count", orgSlug, eventSlug]`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/__tests__/lib/guests-hooks.test.ts
import { describe, expect, it } from "vitest";
import type { GuestEditInput } from "@/lib/guests";

describe("guest hooks types", () => {
  it("GuestEditInput allows contact + custom fields", () => {
    const input: GuestEditInput = {
      full_name: "Ana Lim", email: "ana@x.com", phone_or_chat: "@ana",
      custom_fields: { company: "Acme" },
    };
    expect(input.email).toBe("ana@x.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- guests-hooks`
Expected: FAIL — `GuestEditInput` not exported.

- [ ] **Step 3: Implement**

```ts
// frontend/lib/guests.ts — change the react-query import line to include useQueryClient
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

```ts
// frontend/lib/guests.ts — append
export type GuestEditInput = Partial<
  Pick<Guest, "full_name" | "email" | "phone_or_chat" | "custom_fields">
>;

function invalidateGuests(qc: ReturnType<typeof useQueryClient>, orgSlug: string, eventSlug: string) {
  qc.invalidateQueries({ queryKey: ["guests", orgSlug, eventSlug] });
  qc.invalidateQueries({ queryKey: ["guests-count", orgSlug, eventSlug] });
}

export function useUpdateGuest(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ guestId, data }: { guestId: string; data: GuestEditInput }) =>
      apiFetch<Guest>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateGuests(qc, orgSlug, eventSlug),
  });
}

export function useVoidGuest(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (guestId: string) =>
      apiFetch<Guest>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/void/`, {
        method: "POST",
      }),
    onSuccess: () => invalidateGuests(qc, orgSlug, eventSlug),
  });
}

export function useDeleteGuest(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (guestId: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateGuests(qc, orgSlug, eventSlug),
  });
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `cd frontend && pnpm test -- guests-hooks && pnpm exec tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/guests.ts frontend/__tests__/lib/guests-hooks.test.ts
git commit -m "feat(frontend): guest edit/void/delete hooks"
```

---

## Task 3: `EventDetailsForm` (edit) component

**Files:**
- Create: `frontend/components/events/event-details-form.tsx`
- Test: `frontend/__tests__/components/event-details-form.test.tsx` (create)

**Interfaces:**
- Consumes: `useEvent` + `useUpdateEvent`/`UpdateEventInput` (Task 1); `Field`
  (`@/components/ui/field`), `Input`, `Button`; `toast` (sonner); `useRouter`
  (`next/navigation`).
- Produces: `<EventDetailsForm orgSlug eventSlug />` — a Card-ish form with Event
  name, URL slug, venue, start/end (datetime-local), timezone, walk-in capacity,
  description. On Save: PATCH; on success toast "Saved"; **if the slug changed**,
  `router.replace(\`/orgs/${orgSlug}/events/${newSlug}/settings/\`)`. On error,
  `toast.error(extractApiError(err))`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/event-details-form.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/events", () => ({
  useEvent: () => ({
    data: { id: "1", name: "Launch", slug: "launch", status: "draft", starts_at: null,
      ends_at: null, timezone: "Asia/Phnom_Penh", venue: "", registration_open: true,
      walkins_enabled: true, walkin_capacity: 0, created_at: "", description: "", banner_image: null },
    isLoading: false,
  }),
  useUpdateEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { EventDetailsForm } from "@/components/events/event-details-form";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("renders the editable event fields prefilled", () => {
  wrap(<EventDetailsForm orgSlug="acme" eventSlug="launch" />);
  expect((screen.getByLabelText(/event name/i) as HTMLInputElement).value).toBe("Launch");
  expect((screen.getByLabelText(/url slug/i) as HTMLInputElement).value).toBe("launch");
  expect(screen.getByLabelText(/venue/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- event-details-form`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// frontend/components/events/event-details-form.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extractApiError } from "@/lib/api";
import { useEvent, useUpdateEvent, type UpdateEventInput } from "@/lib/events";

// datetime-local <-> ISO helpers. The input is in the browser's local time;
// we round-trip through Date for a pragmatic admin edit (exact tz math is
// out of scope — the event also carries its own `timezone` field).
const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

export function EventDetailsForm({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const { data: event, isLoading } = useEvent(orgSlug, eventSlug);
  const update = useUpdateEvent(orgSlug, eventSlug);
  const router = useRouter();

  const [form, setForm] = useState<UpdateEventInput>({});
  useEffect(() => {
    if (event) {
      setForm({
        name: event.name, slug: event.slug, venue: event.venue,
        timezone: event.timezone, walkin_capacity: event.walkin_capacity,
        description: event.description,
        starts_at: event.starts_at, ends_at: event.ends_at,
      });
    }
  }, [event]);

  if (isLoading || !event) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const set = (patch: Partial<UpdateEventInput>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = await update.mutateAsync(form);
      if (saved.slug !== eventSlug) {
        toast.success("Saved — your links now point here.");
        router.replace(`/orgs/${orgSlug}/events/${saved.slug}/settings/`);
      } else {
        toast.success("Event details saved.");
      }
    } catch (err) {
      toast.error(extractApiError(err));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border p-4">
      <h2 className="font-medium">Event details</h2>
      <Field label="Event name" htmlFor="ed-name">
        <Input id="ed-name" value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} required />
      </Field>
      <Field label="URL slug" htmlFor="ed-slug" helper={<>Public form: /e/{orgSlug}/{form.slug || "your-slug"}/register</>}>
        <Input id="ed-slug" className="font-mono" value={form.slug ?? ""} onChange={(e) => set({ slug: e.target.value })} required />
      </Field>
      <Field label="Venue" htmlFor="ed-venue" optional>
        <Input id="ed-venue" value={form.venue ?? ""} onChange={(e) => set({ venue: e.target.value })} />
      </Field>
      <Field label="Starts at" htmlFor="ed-starts" optional>
        <Input id="ed-starts" type="datetime-local" value={toLocalInput(form.starts_at ?? null)} onChange={(e) => set({ starts_at: toIso(e.target.value) })} />
      </Field>
      <Field label="Ends at" htmlFor="ed-ends" optional>
        <Input id="ed-ends" type="datetime-local" value={toLocalInput(form.ends_at ?? null)} onChange={(e) => set({ ends_at: toIso(e.target.value) })} />
      </Field>
      <Field label="Timezone" htmlFor="ed-tz">
        <Input id="ed-tz" value={form.timezone ?? ""} onChange={(e) => set({ timezone: e.target.value })} />
      </Field>
      <Field label="Walk-in capacity" htmlFor="ed-cap" helper={<><code>0</code> means unlimited.</>}>
        <Input id="ed-cap" type="number" min={0} className="font-mono" value={form.walkin_capacity ?? 0}
          onChange={(e) => set({ walkin_capacity: Number(e.target.value) })} />
      </Field>
      <Field label="Description" htmlFor="ed-desc" optional>
        <Textarea id="ed-desc" value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save changes"}</Button>
    </form>
  );
}
```

> NOTE: confirm `Field`'s prop names (`label`, `htmlFor`, `helper`, `optional`) and
> that `Textarea` exists at `@/components/ui/textarea` — both are used by
> `components/wizard/steps/basics-step.tsx` and `components/ui/`. Adjust the import
> if the export name differs.

- [ ] **Step 4: Run test + gates**

Run: `cd frontend && pnpm test -- event-details-form && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS, all gates clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/events/event-details-form.tsx frontend/__tests__/components/event-details-form.test.tsx
git commit -m "feat(frontend): event details edit form"
```

---

## Task 4: `EventDangerZone` (delete) component

**Files:**
- Create: `frontend/components/events/event-danger-zone.tsx`
- Test: `frontend/__tests__/components/event-danger-zone.test.tsx` (create)

**Interfaces:**
- Consumes: `useDeleteEvent` (Task 1); `useGuestsCount` (`@/lib/guests`);
  `ConfirmDialog` (`@/components/common/confirm-dialog`); `Button`; `toast`; `useRouter`.
- Produces: `<EventDangerZone orgSlug eventSlug />` — a destructive section with a
  Delete button. When `guestCount > 0` the button is **disabled** with a helper
  line ("Archive it instead — events with guests can't be deleted"). Otherwise a
  `ConfirmDialog` triggers `useDeleteEvent`; on success → toast + `router.replace(\`/orgs/${orgSlug}\`)`;
  on error → `toast.error(extractApiError(err))` (covers the 409 audit-history case).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/event-danger-zone.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const deleteMock = vi.fn();
vi.mock("@/lib/events", () => ({ useDeleteEvent: () => ({ mutateAsync: deleteMock, isPending: false }) }));
vi.mock("@/lib/guests", () => ({ useGuestsCount: () => ({ data: 3 }) }));

import { EventDangerZone } from "@/components/events/event-danger-zone";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("disables delete when the event has guests", () => {
  wrap(<EventDangerZone orgSlug="acme" eventSlug="launch" />);
  expect(screen.getByRole("button", { name: /delete event/i })).toBeDisabled();
  expect(screen.getByText(/archive it instead/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- event-danger-zone`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// frontend/components/events/event-danger-zone.tsx
"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { extractApiError } from "@/lib/api";
import { useDeleteEvent } from "@/lib/events";
import { useGuestsCount } from "@/lib/guests";

export function EventDangerZone({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const { data: guestCount } = useGuestsCount(orgSlug, eventSlug);
  const del = useDeleteEvent(orgSlug);
  const router = useRouter();
  const hasGuests = (guestCount ?? 0) > 0;

  const onDelete = async () => {
    try {
      await del.mutateAsync(eventSlug);
      toast.success("Event deleted.");
      router.replace(`/orgs/${orgSlug}`);
    } catch (err) {
      toast.error(extractApiError(err));
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-destructive/40 p-4">
      <h2 className="font-medium text-destructive">Danger zone</h2>
      {hasGuests ? (
        <>
          <Button variant="destructive" disabled aria-disabled>
            Delete event
          </Button>
          <p className="text-sm text-muted-foreground">
            Archive it instead — events with guests can&apos;t be deleted.
          </p>
        </>
      ) : (
        <>
          <ConfirmDialog
            trigger={<Button variant="destructive">Delete event</Button>}
            title="Delete this event?"
            description="This permanently deletes the event. It can't be undone."
            confirmLabel="Delete event"
            onConfirm={onDelete}
          />
          <p className="text-sm text-muted-foreground">
            Only events with no guests and no activity history can be deleted; otherwise archive.
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test + gates**

Run: `cd frontend && pnpm test -- event-danger-zone && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/events/event-danger-zone.tsx frontend/__tests__/components/event-danger-zone.test.tsx
git commit -m "feat(frontend): event delete danger zone (guarded)"
```

---

## Task 5: Mount the form + danger zone on the Settings page

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/settings/page.tsx`

**Interfaces:**
- Consumes: `EventDetailsForm` (Task 3), `EventDangerZone` (Task 4).

- [ ] **Step 1: Edit the page**

Add the two imports and mount the components. The page currently renders
PinManagementCard / WalkinSettingsCard / GoogleFormBridgeCard; put the details
form FIRST and the danger zone LAST:

```tsx
// frontend/app/(app)/orgs/[slug]/events/[eventSlug]/settings/page.tsx
"use client";

import { useParams } from "next/navigation";

import { EventDangerZone } from "@/components/events/event-danger-zone";
import { EventDetailsForm } from "@/components/events/event-details-form";
import { PinManagementCard } from "@/components/events/pin-management-card";
import { WalkinSettingsCard } from "@/components/events/walkin-settings-card";
import { GoogleFormBridgeCard } from "@/components/integrations/google-form-bridge-card";

export default function EventSettingsPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Event settings</h1>
        <p className="text-sm text-muted-foreground">
          Edit event details, door-day controls, and optional pilot integrations.
        </p>
      </div>
      <EventDetailsForm orgSlug={slug} eventSlug={eventSlug} />
      <PinManagementCard orgSlug={slug} eventSlug={eventSlug} />
      <WalkinSettingsCard orgSlug={slug} eventSlug={eventSlug} />
      <GoogleFormBridgeCard orgSlug={slug} eventSlug={eventSlug} />
      <EventDangerZone orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
```

- [ ] **Step 2: Verify gates (no new unit test — composition only)**

Run: `cd frontend && nvm use 20 && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check && pnpm test`
Expected: typecheck/lint/format clean; existing suite still passes.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(app)/orgs/[slug]/events/[eventSlug]/settings/page.tsx"
git commit -m "feat(frontend): mount event details form + danger zone on settings"
```

---

## Task 6: `GuestEditDrawer` (edit / void / delete / resend)

**Files:**
- Create: `frontend/components/guests/guest-edit-drawer.tsx`
- Test: `frontend/__tests__/components/guest-edit-drawer.test.tsx` (create)

**Interfaces:**
- Consumes: `useUpdateGuest`/`useVoidGuest`/`useDeleteGuest`/`GuestEditInput` (Task 2),
  `useSendQrEmail` (`@/lib/guests`), `useFields` (`@/lib/events`) for custom-field
  labels; `Dialog`+`DialogContent`+`DialogHeader`+`DialogTitle` (`@/components/ui/dialog`),
  `ConfirmDialog`, `Button`, `Field`, `Input`, `toast`, `extractApiError`,
  the `Guest` type (`@/lib/guests`), `RegistrationField` type (`@/lib/events`).
- Produces: `<GuestEditDrawer orgSlug eventSlug guest open onClose />` where
  `guest: Guest | null`. A right-anchored Dialog (drawer) editing
  full_name/email/phone_or_chat + each non-preset custom field; buttons Save,
  Resend QR (pre-registered + has email), Void (confirm), Delete (confirm; on 409
  toast directs to Void). Each mutation toasts and closes on success.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/guest-edit-drawer.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/guests", () => ({
  useUpdateGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGuest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendQrEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/events", () => ({ useFields: () => ({ data: { results: [] } }) }));

import { GuestEditDrawer } from "@/components/guests/guest-edit-drawer";

const guest = {
  id: "g1", guest_type: "pre_registered" as const, entry_status: "registered_not_arrived",
  info_status: "info_completed", full_name: "Ana", email: "ana@x.com", phone_or_chat: "",
  custom_fields: {}, source: "", checked_in_at: null, created_at: "",
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it("shows the editable guest fields + actions when open", () => {
  wrap(<GuestEditDrawer orgSlug="acme" eventSlug="launch" guest={guest} open onClose={() => {}} />);
  expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe("Ana");
  expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /void/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- guest-edit-drawer`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// frontend/components/guests/guest-edit-drawer.tsx
"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { extractApiError } from "@/lib/api";
import { useFields, type RegistrationField } from "@/lib/events";
import {
  useDeleteGuest, useSendQrEmail, useUpdateGuest, useVoidGuest,
  type Guest, type GuestEditInput,
} from "@/lib/guests";

const PRESET = new Set(["name", "email", "phone_or_chat"]);

export function GuestEditDrawer({
  orgSlug, eventSlug, guest, open, onClose,
}: { orgSlug: string; eventSlug: string; guest: Guest | null; open: boolean; onClose: () => void }) {
  const update = useUpdateGuest(orgSlug, eventSlug);
  const voidGuest = useVoidGuest(orgSlug, eventSlug);
  const del = useDeleteGuest(orgSlug, eventSlug);
  const sendQr = useSendQrEmail(orgSlug, eventSlug);
  const { data: fields } = useFields(orgSlug, eventSlug);
  const customFields = (fields?.results ?? []).filter((f: RegistrationField) => !PRESET.has(f.field_key));

  const [form, setForm] = useState<GuestEditInput>({});
  useEffect(() => {
    if (guest) {
      setForm({
        full_name: guest.full_name, email: guest.email, phone_or_chat: guest.phone_or_chat,
        custom_fields: { ...guest.custom_fields },
      });
    }
  }, [guest]);

  if (!guest) return null;

  const onSave = async () => {
    try {
      await update.mutateAsync({ guestId: guest.id, data: form });
      toast.success("Guest updated.");
      onClose();
    } catch (err) {
      toast.error(extractApiError(err));
    }
  };
  const onVoid = async () => {
    try { await voidGuest.mutateAsync(guest.id); toast.success("Guest voided."); onClose(); }
    catch (err) { toast.error(extractApiError(err)); }
  };
  const onDelete = async () => {
    try { await del.mutateAsync(guest.id); toast.success("Guest deleted."); onClose(); }
    catch (err) { toast.error(extractApiError(err)); }
  };
  const onResend = async () => {
    try { await sendQr.mutateAsync(guest.id); toast.success("QR email queued."); }
    catch (err) { toast.error(extractApiError(err)); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="top-0 right-0 left-auto h-full max-w-md translate-x-0 translate-y-0 rounded-none rounded-l-xl">
        <DialogHeader>
          <DialogTitle>Edit guest</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto">
          <Field label="Name" htmlFor="gd-name">
            <Input id="gd-name" value={form.full_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </Field>
          <Field label="Email" htmlFor="gd-email">
            <Input id="gd-email" type="email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Phone / chat" htmlFor="gd-phone">
            <Input id="gd-phone" value={form.phone_or_chat ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone_or_chat: e.target.value }))} />
          </Field>
          {customFields.map((f: RegistrationField) => (
            <Field key={f.field_key} label={f.label_en} htmlFor={`gd-${f.field_key}`}>
              <Input id={`gd-${f.field_key}`}
                value={form.custom_fields?.[f.field_key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, custom_fields: { ...prev.custom_fields, [f.field_key]: e.target.value } }))} />
            </Field>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={onSave} disabled={update.isPending}>Save</Button>
          {guest.guest_type === "pre_registered" && guest.email && (
            <Button variant="outline" onClick={onResend} disabled={sendQr.isPending}>Resend QR</Button>
          )}
          <ConfirmDialog
            trigger={<Button variant="outline">Void</Button>}
            title="Void this guest?" description="Marks them voided and removes them from active counts. Reversible by an admin."
            confirmLabel="Void" destructive onConfirm={onVoid}
          />
          <ConfirmDialog
            trigger={<Button variant="destructive">Delete</Button>}
            title="Delete this guest?" description="Permanent. Only guests with no activity history can be deleted — otherwise void."
            confirmLabel="Delete" onConfirm={onDelete}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test + gates**

Run: `cd frontend && pnpm test -- guest-edit-drawer && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/guests/guest-edit-drawer.tsx frontend/__tests__/components/guest-edit-drawer.test.tsx
git commit -m "feat(frontend): guest edit/void/delete drawer"
```

---

## Task 7: Wire the drawer into `GuestsTable`

**Files:**
- Modify: `frontend/components/guests/guests-table.tsx`
- Test: `frontend/__tests__/components/guests-table-edit.test.tsx` (create)

**Interfaces:**
- Consumes: `GuestEditDrawer` (Task 6), `Guest` type.
- Produces: an "Edit" `Button` in each row's action cell (for BOTH guest types)
  that opens the drawer for that guest; drawer state held in the table.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/guests-table-edit.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/guests", () => ({
  useGuests: () => ({ data: { count: 1, results: [{ id: "g1", guest_type: "walk_in",
    entry_status: "displayed", info_status: "info_completed", full_name: "Bo", email: "",
    phone_or_chat: "", custom_fields: {}, source: "", checked_in_at: null, created_at: "2026-06-01" }] }, isLoading: false }),
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

it("renders an Edit action on each guest row", () => {
  wrap(<GuestsTable orgSlug="acme" eventSlug="launch" />);
  expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && nvm use 20 && pnpm test -- guests-table-edit`
Expected: FAIL — no Edit button yet.

- [ ] **Step 3: Implement**

Read `frontend/components/guests/guests-table.tsx` first. Then:

(a) Add the import + a state hook near the other `useState`s (after line ~59):
```tsx
import { GuestEditDrawer } from "@/components/guests/guest-edit-drawer";
import type { Guest } from "@/lib/guests";   // if not already imported
// inside the component, with the other useState hooks:
const [editing, setEditing] = useState<Guest | null>(null);
```

(b) In the row action cell (`<td className={cn(stickyRight, …)}>`), add an Edit
button as the FIRST action, for every row (before the walk-in/pre-reg branch):
```tsx
<Button variant="outline" size="sm" onClick={() => setEditing(g)}>Edit</Button>
```

(c) After the table element (before the closing wrapper of the component's
return), render the drawer:
```tsx
<GuestEditDrawer
  orgSlug={orgSlug}
  eventSlug={eventSlug}
  guest={editing}
  open={editing !== null}
  onClose={() => setEditing(null)}
/>
```

- [ ] **Step 4: Run test + gates**

Run: `cd frontend && pnpm test -- guests-table-edit && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check && pnpm test`
Expected: PASS; full suite green.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/guests/guests-table.tsx frontend/__tests__/components/guests-table-edit.test.tsx
git commit -m "feat(frontend): open guest edit drawer from the guest list"
```

---

## Task 8: Public page slug-redirect + final gates

**Files:**
- Modify: `frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx`

**Interfaces:**
- Produces: when the requested `eventSlug` differs from the canonical `slug` the
  backend returns (because it resolved a retired-slug alias), the server component
  issues a `redirect()` to the canonical register URL — so old links keep working.

- [ ] **Step 1: Add the redirect to the server component**

Read the modified-Next routing docs for `redirect` usage first
(`frontend/node_modules/next/dist/docs/`). Then in `register/page.tsx`, after
`const event = await loadEvent(orgSlug, eventSlug);` and the `if (!event)` guard,
add:

```tsx
import { redirect } from "next/navigation";
// …after the !event guard:
  if (event.slug !== eventSlug) {
    redirect(`/e/${orgSlug}/${event.slug}/register/`);
  }
```

(The backend `PublicEventDetailView` resolves an alias to the current event and
returns its canonical `slug`; this turns an old-slug request into a redirect to
the new path. Trailing slash matches `trailingSlash: true` in `next.config.ts`.)

- [ ] **Step 2: Verify the gates + full suite**

Run: `cd frontend && nvm use 20 && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check && pnpm test`
Expected: typecheck/lint/format clean; **full unit suite green**.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx"
git commit -m "feat(frontend): redirect retired event slug to canonical on the public page"
```

- [ ] **Step 4: Manual acceptance (Docker dev stack — optional but recommended)**

Bring the full stack up (offset ports per the dev-stack README) and manually
verify: open an event Settings page → edit the name + slug → saved + URL updates;
the old public `/e/<org>/<old-slug>/register/` redirects to the new slug; on the
guest list, Edit a guest → Save; Void a guest; Delete a no-history guest; a
delete of an event-with-guests shows the "archive instead" guidance. (Automated
Playwright e2e for these flows is deferred — the current CI e2e job has no backend.)

---

## Self-Review

- **Spec coverage (frontend section):** event edit form (T3) + slug-change
  router.replace (T3) + event delete guarded (T4) on Settings (T5); guest
  edit/void/delete drawer (T6) reachable from the list (T7); public slug-redirect
  (T8); hooks (T1, T2). Automated e2e explicitly deferred (no backend in CI e2e) —
  replaced by component tests + a documented Docker-stack manual acceptance.
- **Placeholder scan:** none — full code for every new file/hook; integration
  edits (T5, T7, T8) show the exact snippets + name the file to read for placement.
- **Type consistency:** `UpdateEventInput` (T1), `GuestEditInput` (T2),
  `useDeleteEvent`/`useUpdateGuest`/`useVoidGuest`/`useDeleteGuest`,
  `GuestEditDrawer` props (`guest/open/onClose`), and the `["guests", orgSlug,
  eventSlug]` invalidation key are used consistently across T1–T7.

## Out of scope
List-scaling (Plan B), a standalone guest detail/history page, bulk actions,
automated Playwright e2e for these flows (needs a backend in the CI e2e job).
