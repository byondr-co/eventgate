import { test, expect } from "@playwright/test";

test("debug health page renders backend healthcheck", async ({ page }) => {
  await page.goto("/debug/health");
  await expect(page.getByText(/Backend: ok/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Database: ok/i)).toBeVisible({ timeout: 10_000 });
});
