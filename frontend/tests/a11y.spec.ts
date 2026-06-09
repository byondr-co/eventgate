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

  // Tab from the document into the first interactive control, then read the focused
  // element and its computed focus styles atomically (no re-query gap / flake).
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return { tag: el.tagName, outline: s.outlineStyle, boxShadow: s.boxShadow };
  });

  // Keyboard must reach a real interactive control (not stay on <body>).
  expect(focused, "Tab did not move focus to an interactive control").not.toBeNull();
  if (!focused) throw new Error("unreachable");

  // That control must expose a visible focus indicator (outline or a ring/box-shadow).
  const hasFocusIndicator =
    focused.outline !== "none" || (focused.boxShadow !== "none" && focused.boxShadow !== "");
  expect(
    hasFocusIndicator,
    `focus indicator missing on <${focused.tag}> — outline: ${focused.outline}, boxShadow: ${focused.boxShadow}`,
  ).toBe(true);
});
