# PR2 — Responsive / Mobile QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find and fix blocking responsive defects on the pilot-critical paths at 375/768/1024px, and add a Playwright mobile-overflow guard to CI.

**Architecture:** A new browser-level Playwright spec (`tests/responsive.spec.ts`) asserts no horizontal overflow (and a 24px touch-target floor) across viewports. Backend-free routes are tested directly; authenticated routes render via a single `page.route('**/api/v1/**')` stub router. Two real fixes: a responsive `ThemeToggle` + app-shell header (F1), and a wrappable org-dashboard header row (F2). The spec is wired into the existing `e2e` CI job by explicit path, mirroring #73's a11y wiring.

**Tech Stack:** Next.js (App Router) + Tailwind, `@playwright/test`, `next-themes`, react-query.

---

## Context for the implementer (read once)

- Run everything from `frontend/`. First: `source ~/.nvm/nvm.sh && nvm use 20`.
- Merge gate (must stay green): `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`. Three pre-existing `<img>` lint warnings are accepted.
- Playwright boots its own `pnpm dev` server (see `playwright.config.ts`); no backend needed. Run a spec by **explicit path**: `pnpm exec playwright test tests/responsive.spec.ts --project=chromium` (a bare name filter also matches the backend-dependent `healthcheck.spec.ts`).
- Client `apiFetch` (`lib/api.ts`) uses a relative base in the browser, so client calls go to the Playwright origin at `/api/v1/...` and are interceptable with `page.route`.
- Design rule: scanner + walk-in stay bold/colored/glanceable. No redesign. Fix only blocking defects (overflow, clipped/overlapping/unreachable controls, <24px targets, illegible text).
- a11y must not regress: after the F1 toggle change, re-run `tests/a11y.spec.ts`.

## File structure

- **Create** `frontend/tests/responsive.spec.ts` — the mobile-overflow + touch-target spec and its inline helpers (`VIEWPORTS`, `assertNoHorizontalOverflow`, `stubApi`).
- **Modify** `frontend/components/common/theme-toggle.tsx` — icon-only segment labels below `sm:`; responsive SSR placeholder width (F1).
- **Modify** `frontend/app/(app)/layout.tsx` — header row wraps; email hidden below `sm:` and truncates (F1).
- **Modify** `frontend/app/(app)/orgs/[slug]/page.tsx` — dashboard header row wraps + `min-w-0` (F2).
- **Modify** `.github/workflows/frontend.yml` (repo root, not under `frontend/`) — add a responsive-e2e step to the `e2e` job.

---

## Task 1: Responsive spec harness + backend-free baseline

Establishes the spec file, viewport loop, overflow helper, and the API stub router, and locks the already-mobile-first public/auth/scanner routes against regression. These assertions are expected to PASS (characterization); the red-first fixes are Tasks 2–3.

**Files:**
- Create: `frontend/tests/responsive.spec.ts`

- [ ] **Step 1: Write the spec with helpers + backend-free no-overflow tests**

```ts
import { test, expect, type Page, type Route } from "@playwright/test";

const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
] as const;

/** Assert the document is not wider than the viewport (1px sub-pixel tolerance). */
async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth };
  });
  expect(
    overflow.scrollWidth,
    `horizontal overflow: scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

/**
 * Intercept all client API calls (apiFetch uses a relative base in the browser, so they
 * hit this origin at /api/v1/...). Returns canned JSON by pathname, with a safe empty
 * default so unstubbed endpoints never hang the page.
 */
type StubOpts = { email?: string; org?: { name: string; slug: string } };
async function stubApi(page: Page, opts: StubOpts = {}) {
  await page.route("**/api/v1/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/auth/me/")) {
      return json({ email: opts.email ?? "user@example.com" });
    }
    if (opts.org && path.endsWith(`/orgs/${opts.org.slug}/`)) {
      return json({ name: opts.org.name, slug: opts.org.slug, role: "owner" });
    }
    // List endpoints (events, members, guests, …) → empty page.
    if (path.endsWith("/")) return json({ results: [], count: 0 });
    return json({});
  });
}

// Public / auth / scanner routes render real responsive containers with no backend.
const BACKEND_FREE_ROUTES = ["/login", "/scanner/enroll"];

for (const vp of VIEWPORTS) {
  for (const route of BACKEND_FREE_ROUTES) {
    test(`no horizontal overflow: ${route} @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page);
    });
  }
}

test("login submit button meets the 24px touch-target floor @ 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const submit = page.getByRole("button", { name: /send|sign in|link/i }).first();
  const box = await submit.boundingBox();
  expect(box, "submit button not found").not.toBeNull();
  if (!box) throw new Error("unreachable");
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
});
```

- [ ] **Step 2: Run the baseline tests**

Run: `pnpm exec playwright test tests/responsive.spec.ts --project=chromium`
Expected: PASS (public/auth/scanner routes are mobile-first; this locks them in).
If `/scanner/enroll` redirects or errors, adjust to the enroll landing it actually renders — the assertion is page-level overflow only.

- [ ] **Step 3: Verify the merge gate is unaffected**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS (the 3 pre-existing `<img>` warnings remain).

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/responsive.spec.ts
git commit -m "test(responsive): add mobile-overflow harness + backend-free baseline"
```

---

## Task 2: F1 — fix app-shell header overflow at 375px

**Files:**
- Modify: `frontend/components/common/theme-toggle.tsx`
- Modify: `frontend/app/(app)/layout.tsx`
- Test: `frontend/tests/responsive.spec.ts`

- [ ] **Step 1: Add the failing F1 test**

Append to `tests/responsive.spec.ts`:

```ts
test.describe("app-shell header (F1)", () => {
  for (const vp of VIEWPORTS) {
    test(`header has no horizontal overflow @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await stubApi(page, {
        email: "very.long.email.address@example-organization.coop",
      });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // me is stubbed; org is NOT → the page body shows "Organization not found",
      // but the shared (app) layout header renders fully and is what we measure.
      await page.goto("/orgs/__qa__");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("link", { name: "Eventgate" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }
});
```

- [ ] **Step 2: Run it and confirm it FAILS at 375px**

Run: `pnpm exec playwright test tests/responsive.spec.ts --project=chromium -g "header has no horizontal overflow"`
Expected: FAIL at `phone (375px)` — the 208px (`min-w-[13rem]`) ThemeToggle + email + Sign out overflow the ~327px usable width. (768/1024 likely pass.)

- [ ] **Step 3: Make the ThemeToggle compact below `sm:`**

In `frontend/components/common/theme-toggle.tsx`, wrap each label's text in an `sr-only sm:not-sr-only` span (keeps the accessible name at all widths; icon-only visually below `sm:`), make the icon/text gap responsive, and shrink the SSR placeholder to match. Replace the `OPTIONS` array and the placeholder return:

```tsx
const OPTIONS: { value: ThemeValue; label: React.ReactNode }[] = [
  {
    value: "light",
    label: (
      <span className="flex items-center gap-0 sm:gap-1.5">
        <SunIcon className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Light</span>
      </span>
    ),
  },
  {
    value: "dark",
    label: (
      <span className="flex items-center gap-0 sm:gap-1.5">
        <MoonIcon className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Dark</span>
      </span>
    ),
  },
  {
    value: "system",
    label: (
      <span className="flex items-center gap-0 sm:gap-1.5">
        <MonitorIcon className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">System</span>
      </span>
    ),
  },
];
```

And the placeholder branch:

```tsx
  if (resolvedTheme === undefined) {
    // Reserve space until next-themes resolves on the client. Width matches the compact
    // (icon-only) control below sm: and the full control at sm:+, avoiding a hydration jump.
    return <div className={cn("h-8 w-[7.5rem] sm:w-[13rem]", className)} aria-hidden="true" />;
  }
```

- [ ] **Step 4: Let the header row wrap and tame the email**

In `frontend/app/(app)/layout.tsx`, replace the header inner row + email span. Make the outer row wrap, and hide the email below `sm:` (truncating it at `sm:`+ so it can never push the row wide):

```tsx
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
            <Link href="/" className="font-semibold">
              Eventgate
            </Link>
            <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-3">
              <ThemeToggle />
              <span className="hidden max-w-[12rem] truncate text-muted-foreground sm:inline">
                {me.data?.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await logout.mutateAsync();
                  router.replace("/login");
                }}
              >
                Sign out
              </Button>
            </div>
          </div>
        </header>
```

- [ ] **Step 5: Run the F1 test and confirm PASS at all viewports**

Run: `pnpm exec playwright test tests/responsive.spec.ts --project=chromium -g "header has no horizontal overflow"`
Expected: PASS at 375/768/1024.

- [ ] **Step 6: Confirm a11y did not regress**

Run: `pnpm exec playwright test tests/a11y.spec.ts --project=chromium`
Expected: PASS (the toggle keeps `aria-label="Color theme"` and each option keeps its accessible name via the `sr-only` text).

- [ ] **Step 7: Run the merge gate**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS (3 accepted `<img>` warnings).

- [ ] **Step 8: Commit**

```bash
git add frontend/components/common/theme-toggle.tsx frontend/app/\(app\)/layout.tsx frontend/tests/responsive.spec.ts
git commit -m "fix(responsive): compact theme toggle + wrap app-shell header on small screens"
```

---

## Task 3: F2 — wrap the org-dashboard header row

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/page.tsx:18-30`
- Test: `frontend/tests/responsive.spec.ts`

- [ ] **Step 1: Add the F2 test**

Append to `tests/responsive.spec.ts`:

```ts
test("org dashboard header row has no overflow with a long name @ 375px (F2)", async ({
  page,
}) => {
  await stubApi(page, {
    email: "user@example.com",
    org: { name: "Phnom Penh Tech Founders & Builders Community Association", slug: "__qa__" },
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/orgs/__qa__");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: /Phnom Penh Tech Founders/ }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
```

- [ ] **Step 2: Run it and observe the result**

Run: `pnpm exec playwright test tests/responsive.spec.ts --project=chromium -g "org dashboard header row"`
Expected: FAIL @ 375px — the `flex items-center justify-between` row holds a `text-2xl` name (+ edit pencil) and a "Members" button on one non-wrapping line.

- [ ] **Step 3: Make the row wrap and let the name shrink**

In `frontend/app/(app)/orgs/[slug]/page.tsx`, change the header row (lines 20–30):

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <OrgNameEditor orgSlug={slug} name={org.name} />
          <p className="text-sm text-muted-foreground">
            {org.slug} · {org.role}
          </p>
        </div>
        <Link href={`/orgs/${slug}/members`} className={buttonVariants({ variant: "outline" })}>
          Members
        </Link>
      </div>
```

- [ ] **Step 4: Run the F2 test and confirm PASS**

Run: `pnpm exec playwright test tests/responsive.spec.ts --project=chromium -g "org dashboard header row"`
Expected: PASS (the Members button wraps below the name; `min-w-0` lets the `text-2xl` heading wrap instead of overflowing).

- [ ] **Step 5: Run the full responsive spec + merge gate**

Run: `pnpm exec playwright test tests/responsive.spec.ts --project=chromium && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/\(app\)/orgs/\[slug\]/page.tsx frontend/tests/responsive.spec.ts
git commit -m "fix(responsive): wrap org dashboard header row on small screens"
```

---

## Task 4: Event dashboard + EventTabsNav scroll-sanity (F3)

Characterization: confirm the event dashboard and its tab strip don't force page-level overflow, and the tab strip is horizontally scrollable. Expected green with no code change (the nav already has `overflow-x-auto`).

**Files:**
- Test: `frontend/tests/responsive.spec.ts`

- [ ] **Step 1: Add the F3 test**

Append to `tests/responsive.spec.ts` (the `stubApi` catch-all returns the event object for the event endpoint and empty lists for counts, so the dashboard + tabs render):

```ts
test.describe("event dashboard + tabs (F3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      if (path.endsWith("/auth/me/")) return json({ email: "user@example.com" });
      if (path.endsWith("/orgs/__qa__/events/__ev__/")) {
        return json({ name: "QA Event", slug: "__ev__", status: "live", venue: "Hall A" });
      }
      if (path.endsWith("/")) return json({ results: [], count: 0 });
      return json({});
    });
  });

  for (const vp of VIEWPORTS) {
    test(`event dashboard no page overflow @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/orgs/__qa__/events/__ev__");
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page);
    });
  }

  test("event tab strip is horizontally scrollable @ 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/orgs/__qa__/events/__ev__");
    await page.waitForLoadState("networkidle");
    const nav = page.getByRole("navigation", { name: "Event sections" });
    const scrollable = await nav.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable, "tab strip should overflow its container and scroll").toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm exec playwright test tests/responsive.spec.ts --project=chromium -g "F3"`
Expected: PASS (no page overflow; nav scrolls). If the page itself overflows at 375px, that is a real F3 finding — fix the offending element with a minimal Tailwind change (e.g. add `overflow-x-auto`/`min-w-0`/`flex-wrap`) and re-run, mirroring F1/F2.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/responsive.spec.ts
git commit -m "test(responsive): lock event dashboard + tab-strip scroll behavior (F3)"
```

---

## Task 5: Wire the responsive spec into CI

**Files:**
- Modify: `.github/workflows/frontend.yml` (the `e2e` job)

- [ ] **Step 1: Add a responsive-e2e step after the a11y step**

In `.github/workflows/frontend.yml`, inside the `e2e` job, add this step immediately after the "Accessibility e2e" step and before "Upload Playwright report":

```yaml
      - name: Responsive e2e (mobile/tablet overflow on critical paths)
        # Explicit spec path: a bare filter also matches the backend-dependent
        # healthcheck.spec.ts. Asserts no horizontal overflow at 375/768/1024 and a
        # 24px touch-target floor; authenticated routes render via page.route stubs.
        run: pnpm exec playwright test tests/responsive.spec.ts --project=chromium
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `cd .. && python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/frontend.yml')); print('YAML OK')"`
Expected: `YAML OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/frontend.yml
git commit -m "ci(frontend): run responsive mobile-overflow e2e on PRs"
```

---

## Task 6: Manual scroll-sanity pass + final verification + PR

Tables (guests/members/devices/links/events) are scroll-sanity only — verified manually since they need realistic data to populate columns.

- [ ] **Step 1: Manual table + scanner check**

Run `pnpm dev`, open Chrome DevTools device toolbar at 375px, and confirm:
- Guests table (`/orgs/<org>/events/<event>/guests`) scrolls horizontally inside its container; the page itself does not overflow; sticky first/last columns behave.
- Scanner `/scanner/scan` and `/scanner/walkin` stay glanceable and don't overflow.
Record findings; fix only page-level overflow (minimal Tailwind), otherwise leave as-is per scope.

- [ ] **Step 2: Full verification sweep**

Run:
```bash
pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check
pnpm exec playwright test tests/a11y.spec.ts --project=chromium
pnpm exec playwright test tests/responsive.spec.ts --project=chromium
```
Expected: all PASS (3 accepted `<img>` warnings).

- [ ] **Step 3: Open the PR**

```bash
git push -u origin claude/musing-hypatia-03cd19
gh auth switch --hostname github.com --user vineidev
gh pr create --title "fix(responsive): mobile/tablet QA — app-shell header + org dashboard + CI overflow guard" \
  --body "PR2 of the UI/UX-deepening lane. Fixes F1 (app-shell header overflow at 375px via a compact theme toggle + wrapping header) and F2 (org dashboard header row). Adds tests/responsive.spec.ts (no-overflow at 375/768/1024 + 24px touch-target floor) wired into the e2e CI job. Tables/scanner verified by manual scroll-sanity. Out of scope (recorded for a future design-system decision): primary CTAs are h-8/h-9 (32–36px), below the 44px comfort target; PR2 uses the WCAG 2.2 AA 24px minimum per the spec."
```

- [ ] **Step 4: Confirm CI is green**

Run: `gh pr checks --watch`
Expected: the `e2e` job (now running both a11y and responsive specs) passes.

---

## Self-review notes

- **Spec coverage:** F1 → Task 2; F2 → Task 3; F3 + tables → Tasks 4 & 6; viewports 375/768/1024 → `VIEWPORTS` loop; no-overflow + 24px floor → Tasks 1–4; CI guard → Task 5; backend-free stubbing → `stubApi` (Task 1). Scanner/public baseline → Task 1 + Task 6.
- **Stub path correctness:** me endpoint is `/api/v1/auth/me/` (not `/api/v1/me`); org is `/api/v1/orgs/<slug>/`; both verified against `lib/auth.ts` / `lib/orgs.ts`.
- **a11y safety:** F1 keeps accessible names via `sr-only sm:not-sr-only` (icon stays `aria-hidden`); Task 2 Step 6 re-runs the a11y spec.
- **No design-system blast radius:** touch-target floor is 24px (buttons are h-8=32px), so no global button resize is forced.
