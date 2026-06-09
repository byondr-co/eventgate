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

/** Satisfy the Next.js 16 proxy auth-guard (proxy.ts checks req.cookies.get("eventgate_access")). */
async function setAuthCookie(page: Page) {
  await page
    .context()
    .addCookies([
      { name: "eventgate_access", value: "test-stub-token", domain: "localhost", path: "/" },
    ]);
}

/**
 * Intercept all client API calls (apiFetch uses a relative base in the browser, so they
 * hit this origin at /api/v1/...). Returns canned JSON by pathname, with a safe empty
 * default so unstubbed endpoints never hang the page.
 *
 * Also sets the `eventgate_access` cookie so the Next.js 16 proxy (proxy.ts) treats
 * the session as authenticated and does not redirect to /login.
 */
type StubOpts = {
  email?: string;
  org?: { name: string; slug: string };
  event?: { orgSlug: string; eventSlug: string; data: Record<string, unknown> };
};
async function stubApi(page: Page, opts: StubOpts = {}) {
  await setAuthCookie(page);

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
    if (
      opts.event &&
      path.endsWith(`/orgs/${opts.event.orgSlug}/events/${opts.event.eventSlug}/`)
    ) {
      return json(opts.event.data);
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
      await expect(page.locator("main").first()).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }
}

test("login submit button meets the 24px touch-target floor @ 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  const submit = page.getByRole("button", { name: /send sign-in link/i });
  await expect(submit).toBeVisible();
  const box = await submit.boundingBox();
  expect(box, "submit button not found").not.toBeNull();
  if (!box) throw new Error("unreachable");
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
});

test("org dashboard header row has no overflow with a long name @ 375px (F2)", async ({ page }) => {
  await stubApi(page, {
    email: "user@example.com",
    org: { name: "Phnom Penh Tech Founders & Builders Community Association", slug: "__qa__" },
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/orgs/__qa__");
  await expect(page.getByRole("heading", { name: /Phnom Penh Tech Founders/ })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

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
      await expect(page.getByRole("link", { name: "Eventgate" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe("event dashboard + tabs (F3)", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page, {
      event: {
        orgSlug: "__qa__",
        eventSlug: "__ev__",
        data: { name: "QA Event", slug: "__ev__", status: "live", venue: "Hall A" },
      },
    });
  });

  for (const vp of VIEWPORTS) {
    test(`event dashboard no page overflow @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/orgs/__qa__/events/__ev__");
      await expect(page.getByRole("navigation", { name: "Event sections" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }

  test("event tab strip is contained and scrollable @ 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/orgs/__qa__/events/__ev__");
    // Wait for the hydrated tab strip (it carries overflow-x-auto from Tailwind).
    await page.waitForSelector('nav[aria-label="Event sections"].overflow-x-auto');
    const nav = page.getByRole("navigation", { name: "Event sections" });
    const info = await nav.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      clientWidth: el.clientWidth,
      viewport: window.innerWidth,
    }));
    // The tab strip exposes a horizontal-scroll affordance (so all tabs are reachable)...
    expect(["auto", "scroll"]).toContain(info.overflowX);
    // ...and is itself contained within the viewport (it never widens the page).
    expect(info.clientWidth).toBeLessThanOrEqual(info.viewport);
  });
});
