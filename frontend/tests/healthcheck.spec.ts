import { test, expect } from "@playwright/test";

test("home page renders backend healthcheck", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Eventgate")).toBeVisible();
  await expect(page.getByText(/Backend: ok/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Database: ok/i)).toBeVisible({ timeout: 10_000 });
});
