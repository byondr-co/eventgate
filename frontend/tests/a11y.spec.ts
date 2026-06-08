import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SERIOUS = new Set(["serious", "critical"]);

for (const theme of ["light", "dark"] as const) {
  test(`login page has no serious/critical axe violations (${theme})`, async ({ page }) => {
    // Seed the theme before the page's JS runs so next-themes applies it pre-hydration.
    await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter((v) => SERIOUS.has(v.impact ?? ""));
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

test("login form is reachable and operable by keyboard with visible focus", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Tab from the document into the first interactive control.
  await page.keyboard.press("Tab");
  const active = page.locator(":focus");
  await expect(active).toBeVisible();

  // The focused element must expose a visible focus indicator (ring/outline).
  const outlineStyles = await active.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, boxShadow: s.boxShadow };
  });
  expect(outlineStyles.outline !== "none" || outlineStyles.boxShadow !== "none").toBeTruthy();
});
