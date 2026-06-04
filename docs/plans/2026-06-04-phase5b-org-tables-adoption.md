# Phase 5b — Org, Members & Tables Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the monochrome design system across org/membership management and the listing tables — full-size controls → `Field`/`Input`/`Select`, dense inline controls → token-aligned native elements, blank tables → `EmptyState`, stray green → `text-success`.

**Architecture:** Presentational migration of five components. Full-size form controls use the primitives; dense inline controls (2xl org-name edit, per-member role select, links per-row inputs) stay native + token-aligned. All hooks, mutations, ConfirmDialog flows, and table logic preserved. Two existing tests (members-table, org-name-editor) stay green.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + `@testing-library/react`. Tests: `pnpm test`; single file `pnpm exec vitest run <path>`.

**Reference spec:** `docs/superpowers/specs/2026-06-04-phase5b-org-tables-adoption-design.md`

---

## Pre-flight (run once)

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend && pnpm install
```

All `pnpm`/`git` commands run from `frontend/`. Commits: single-line conventional, **no `Co-Authored-By` trailer**. Pre-commit hook runs eslint/prettier — re-add and commit if it reformats. Branch `claude/phase5b-org-tables` (already created off `main`).

## File Structure

**Modified:**
- `frontend/components/orgs/create-org-form.tsx` — Field/Input.
- `frontend/components/orgs/org-name-editor.tsx` — token-aligned native input + Button pencil.
- `frontend/components/orgs/members-table.tsx` — invite Input/Select, per-row token select, success token.
- `frontend/components/shorturls/links-table.tsx` — create-row Input, EmptyState, per-row token inputs.
- `frontend/components/events/events-table.tsx` — EmptyState.

**Tests created/modified:**
- Create: `frontend/__tests__/components/orgs/create-org-form.test.tsx`, `frontend/__tests__/components/shorturls/links-table.test.tsx`, `frontend/__tests__/components/events/events-table.test.tsx`
- Modify: `frontend/__tests__/components/orgs/members-table.test.tsx` (add 1 test)
- Unchanged (kept green): `frontend/__tests__/components/orgs/org-name-editor.test.tsx`

---

## Task 1: `create-org-form` → Field/Input

**Files:**
- Modify: `components/orgs/create-org-form.tsx`
- Test: `__tests__/components/orgs/create-org-form.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/orgs/create-org-form.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/orgs", () => ({ useCreateOrg: vi.fn() }));
vi.mock("@/lib/api", () => ({
  extractApiError: (e: unknown) => (e instanceof Error ? e.message : "err"),
}));

import { CreateOrgForm } from "@/components/orgs/create-org-form";
import { useCreateOrg } from "@/lib/orgs";

const mockCreate = vi.mocked(useCreateOrg);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, isError: false } as never);
});

describe("CreateOrgForm", () => {
  it("labels the name field via Field", () => {
    render(<CreateOrgForm />);
    const input = screen.getByLabelText("Organization name");
    expect(input).toHaveAttribute("data-slot", "input");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/orgs/create-org-form.test.tsx`
Expected: FAIL (no label association; raw input has no `data-slot`).

- [ ] **Step 3: Overwrite `components/orgs/create-org-form.tsx`** with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { extractApiError } from "@/lib/api";
import { useCreateOrg } from "@/lib/orgs";

export function CreateOrgForm() {
  const [name, setName] = useState("");
  const create = useCreateOrg();
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const org = await create.mutateAsync(name);
    router.push(`/orgs/${org.slug}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create organization</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Organization name" htmlFor="org-name">
            <Input
              id="org-name"
              type="text"
              required
              minLength={2}
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="byondr.co"
            />
          </Field>
          <Button type="submit" disabled={create.isPending || !name} className="w-full">
            {create.isPending ? "Creating…" : "Create"}
          </Button>
          {create.isError && (
            <p className="text-sm text-destructive">{extractApiError(create.error)}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/orgs/create-org-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/orgs/create-org-form.tsx __tests__/components/orgs/create-org-form.test.tsx
git commit -m "feat(orgs): migrate create-org form to Field/Input"
```

---

## Task 2: `org-name-editor` → token-aligned input + Button pencil

**Files:**
- Modify: `components/orgs/org-name-editor.tsx`
- Test: `__tests__/components/orgs/org-name-editor.test.tsx` (existing — keep green, no edit)

The inline-edit input is `text-2xl` (h1-sized) — the `Input` primitive (h-9/text-sm) does not fit, so the input stays native with only a focus-ring token-align. The pencil button becomes a `Button`.

- [ ] **Step 1: Edit `components/orgs/org-name-editor.tsx`**

(a) Add the Button import after the existing imports:
```tsx
import { Button } from "@/components/ui/button";
```

(b) Replace the pencil `<button>`:
```tsx
        <button
          type="button"
          aria-label="Edit organization name"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
```
with:
```tsx
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Edit organization name"
          onClick={() => setEditing(true)}
        >
          ✎
        </Button>
```

(c) Token-align the edit input's focus ring — change its className:
```tsx
        className="text-2xl font-semibold rounded border border-input bg-background px-2 py-1 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-ring"
```
to:
```tsx
        className="w-full max-w-md rounded border border-input bg-background px-2 py-1 text-2xl font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
```

Keep `autoFocus`, `value`, `onChange`, `onBlur={save}`, `onKeyDown`, and `disabled` exactly as-is. Keep the inline error `<p className="text-sm text-destructive">`.

- [ ] **Step 2: Run the existing test to verify it stays green**

Run: `pnpm exec vitest run __tests__/components/orgs/org-name-editor.test.tsx`
Expected: PASS (4 tests — `getByRole("button", { name: /edit/i })` still matches the Button's aria-label; `getByRole("textbox")` still matches the native input; heading/save/cancel/error behavior unchanged).

- [ ] **Step 3: Commit**

```bash
git add components/orgs/org-name-editor.tsx
git commit -m "feat(orgs): token-align org-name editor input + Button pencil"
```

---

## Task 3: `members-table` → invite Input/Select + per-row token select + success token

**Files:**
- Modify: `components/orgs/members-table.tsx`
- Test: `__tests__/components/orgs/members-table.test.tsx` (add 1 test)

- [ ] **Step 1: Add a failing test** — append this `it` inside the existing `describe("MembersTable", …)` block in `__tests__/components/orgs/members-table.test.tsx`:

```tsx
  it("shows the invite-success message in the success token color", async () => {
    mockApi.mockImplementation((url: string, opts?: { method?: string }) => {
      if (String(url).includes("/members/")) return Promise.resolve(MEMBERS_DATA);
      if (String(url).includes("/invites/") && opts?.method === "POST")
        return Promise.resolve({ id: "i9", email: "new@x.com", role: "admin" });
      if (String(url).includes("/invites/")) return Promise.resolve(EMPTY_INVITES);
      return Promise.resolve({});
    });

    wrap(<MembersTable slug="acme" />);
    await waitFor(() => expect(screen.getByText("owner@x.com")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("teammate@example.com"), {
      target: { value: "new@x.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send invite/ }));
    const msg = await screen.findByText(/Invite sent to new@x.com/);
    expect(msg.className).toContain("text-success");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/orgs/members-table.test.tsx -t "success token color"`
Expected: FAIL (success message currently uses `text-emerald-600`).

- [ ] **Step 3: Edit `components/orgs/members-table.tsx`**

(a) Add imports after the `Card` import:
```tsx
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
```

(b) Invite-form email input — change:
```tsx
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
```
to:
```tsx
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
```

(c) Invite-form role select — change:
```tsx
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
```
to:
```tsx
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </Select>
```

(d) Success message — change:
```tsx
          {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
```
to:
```tsx
          {success && <p className="mt-3 text-sm text-success">{success}</p>}
```

(e) Per-member-row role select (dense table cell) — token-align only; change:
```tsx
                        <select
                          value={m.role ?? ""}
                          onChange={(e) =>
                            updateRole.mutate({ membershipId: m.id, role: e.target.value })
                          }
                          disabled={updateRole.isPending || m.user_email === me.data?.email}
                          className="rounded border border-input bg-background px-2 py-1 text-xs"
                        >
```
to:
```tsx
                        <select
                          value={m.role ?? ""}
                          onChange={(e) =>
                            updateRole.mutate({ membershipId: m.id, role: e.target.value })
                          }
                          disabled={updateRole.isPending || m.user_email === me.data?.email}
                          className="rounded border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
```

Leave all hooks, the `onInvite` handler, the members/invites tables, the role options, and the `ConfirmDialog` flows unchanged.

- [ ] **Step 4: Run the whole test file**

Run: `pnpm exec vitest run __tests__/components/orgs/members-table.test.tsx`
Expected: PASS — the new success-token test plus all existing tests (the invite `Select` and per-row `<select>` both render native `<select>`/`combobox`, so the combobox-count and owner-option assertions still hold).

- [ ] **Step 5: Commit**

```bash
git add components/orgs/members-table.tsx __tests__/components/orgs/members-table.test.tsx
git commit -m "feat(orgs): members invite Input/Select, token role cell, success token"
```

---

## Task 4: `links-table` → create-row Input + EmptyState + per-row token inputs

**Files:**
- Modify: `components/shorturls/links-table.tsx`
- Test: `__tests__/components/shorturls/links-table.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/shorturls/links-table.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shorturls", () => ({
  useShortUrls: vi.fn(),
  useCreateShortUrl: vi.fn(),
  useUpdateShortUrl: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { LinksTable } from "@/components/shorturls/links-table";
import { useCreateShortUrl, useShortUrls, useUpdateShortUrl } from "@/lib/shorturls";

const mockLinks = vi.mocked(useShortUrls);
const mockCreate = vi.mocked(useCreateShortUrl);
const mockUpdate = vi.mocked(useUpdateShortUrl);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  mockUpdate.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
});

describe("LinksTable", () => {
  it("uses the Input primitive for the create-row note field", () => {
    mockLinks.mockReturnValue({ data: { count: 0, results: [] }, isLoading: false } as never);
    render(<LinksTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByPlaceholderText("Label (e.g. Instagram bio)")).toHaveAttribute(
      "data-slot",
      "input",
    );
  });

  it("shows the EmptyState when there are no links", () => {
    mockLinks.mockReturnValue({ data: { count: 0, results: [] }, isLoading: false } as never);
    render(<LinksTable orgSlug="o" eventSlug="e" />);
    expect(screen.getByText("No links yet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/shorturls/links-table.test.tsx`
Expected: FAIL (raw input has no `data-slot`; empty shows "No links yet." text not the EmptyState title "No links yet").

- [ ] **Step 3: Edit `components/shorturls/links-table.tsx`**

(a) Add imports after the `Card` import:
```tsx
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NoLinks } from "@/lib/illustrations";
```

(b) Create-row inputs — change:
```tsx
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
```
to:
```tsx
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Label (e.g. Instagram bio)"
            />
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
```

(c) Empty state — change:
```tsx
          {links.data && links.data.results.length === 0 && (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          )}
```
to:
```tsx
          {links.data && links.data.results.length === 0 && (
            <EmptyState
              illustration={NoLinks}
              title="No links yet"
              message="Create a registration link above to share it on social or in a bio."
            />
          )}
```

(d) Per-row inline inputs (note + date in table cells) — token-align only. Change the note cell input:
```tsx
                      <input
                        defaultValue={s.note}
                        onBlur={(e) => {
                          if (e.target.value !== s.note)
                            update.mutate({ id: s.id, note: e.target.value });
                        }}
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                      />
```
to:
```tsx
                      <input
                        defaultValue={s.note}
                        onBlur={(e) => {
                          if (e.target.value !== s.note)
                            update.mutate({ id: s.id, note: e.target.value });
                        }}
                        className="w-full rounded border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
```
And the date cell input:
```tsx
                      <input
                        type="date"
                        defaultValue={s.expires_at ? s.expires_at.slice(0, 10) : ""}
                        onChange={(e) =>
                          update.mutate({ id: s.id, expires_at: e.target.value || null })
                        }
                        className="rounded border border-input bg-background px-2 py-1 text-xs"
                      />
```
to:
```tsx
                      <input
                        type="date"
                        defaultValue={s.expires_at ? s.expires_at.slice(0, 10) : ""}
                        onChange={(e) =>
                          update.mutate({ id: s.id, expires_at: e.target.value || null })
                        }
                        className="rounded border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
```

Leave the create/copy/disable/enable logic and `ConfirmDialog` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/shorturls/links-table.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/shorturls/links-table.tsx __tests__/components/shorturls/links-table.test.tsx
git commit -m "feat(links): create-row Input + EmptyState + token-aligned row inputs"
```

---

## Task 5: `events-table` → EmptyState

**Files:**
- Modify: `components/events/events-table.tsx`
- Test: `__tests__/components/events/events-table.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/components/events/events-table.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({ useEvents: vi.fn() }));

import { EventsTable } from "@/components/events/events-table";
import { useEvents } from "@/lib/events";

const mockEvents = vi.mocked(useEvents);

beforeEach(() => vi.clearAllMocks());

describe("EventsTable", () => {
  it("shows the EmptyState when there are no events", () => {
    mockEvents.mockReturnValue({ data: { results: [] }, isLoading: false } as never);
    render(<EventsTable orgSlug="o" />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("lists events with status badges when present", () => {
    mockEvents.mockReturnValue({
      data: { results: [{ id: "1", name: "Gala", slug: "gala", status: "open" }] },
      isLoading: false,
    } as never);
    render(<EventsTable orgSlug="o" />);
    expect(screen.getByText("Gala")).toBeInTheDocument();
    expect(screen.getByText("open")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run __tests__/components/events/events-table.test.tsx`
Expected: FAIL on the empty test (current text is "No events yet. Create your first one…", so the exact `getByText("No events yet")` does not match; EmptyState title is exactly "No events yet").

- [ ] **Step 3: Edit `components/events/events-table.tsx`**

(a) Add imports after the `Card` import:
```tsx
import { EmptyState } from "@/components/ui/empty-state";
import { NoEvents } from "@/lib/illustrations";
```

(b) Empty branch — change:
```tsx
        {!isLoading && events.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No events yet. Create your first one to get a public registration URL.
          </p>
        )}
```
to:
```tsx
        {!isLoading && events.length === 0 && (
          <EmptyState
            illustration={NoEvents}
            title="No events yet"
            message="Create your first event to get a public registration URL."
          />
        )}
```

Leave `eventStatusVariant`, the status `Badge`s, the event list, and the "New event" `buttonVariants` link unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run __tests__/components/events/events-table.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/events/events-table.tsx __tests__/components/events/events-table.test.tsx
git commit -m "feat(events): EmptyState for the empty events list"
```

---

## Task 6: Full suite + lint gate

**Files:** none (verification).

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: PASS — all suites green (the new org/links/events tests + the existing members/org-name-editor tests + the rest).

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: `tsc` clean; lint 0 errors (pre-existing `<img>` warnings remain); format clean. Run `pnpm format` and re-commit if formatting changed anything.

- [ ] **Step 3: Verify no leftover stray greens in the touched components**

Run: `grep -rnE "emerald|green-[0-9]" components/orgs/members-table.tsx components/orgs/create-org-form.tsx`
Expected: no matches.

- [ ] **Step 4: Final commit (only if formatting changed anything)**

```bash
git add -A
git commit -m "chore(orgs): format Phase 5b adoption"
```

---

## Self-Review

- **Spec coverage:** §A create-org → Task 1; §B org-name-editor → Task 2; §C members-table → Task 3; §D links-table → Task 4; §E events-table → Task 5; testing/gate → per-task tests + Task 6. Covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code or exact find/replace.
- **Type consistency:** `Field`/`Input`/`Select`/`EmptyState`/`Button` import paths and `NoLinks`/`NoEvents` illustration names match the foundation; `htmlFor="org-name"`/`id="org-name"` pair; the dense inline controls keep their native `<select>`/`<input>` (token-align only) so the members combobox-count test and org-name-editor textbox test stay green; success message uses `text-success`; the members `Button name=/Send invite/` and `org-name-editor` `aria-label="Edit organization name"` (matched by `/edit/i`) are preserved.
