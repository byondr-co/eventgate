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
