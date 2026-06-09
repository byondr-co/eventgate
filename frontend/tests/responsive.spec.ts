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

// Keep stubApi referenced so lint/typecheck don't error on an unused export.
// Later tasks in this file will call it directly.
void (stubApi as unknown);

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
