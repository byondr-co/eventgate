import { expect, test } from "@playwright/test";

// NOTE on coverage scope:
// The event setup wizard's full create -> choose-registration -> review -> go-live
// flow requires an authenticated org member AND a running backend (event creation,
// bridge endpoints, status transition). The frontend e2e harness here boots only
// `pnpm dev` (no backend) and has no authenticated-session fixture, so the full
// happy path is covered by unit tests (frontend/__tests__/components/*wizard*,
// basics/registration/bridge steps) and backend integration tests
// (backend/tests/test_google_form_bridge_*). This spec covers what IS runnable in
// this harness: the route is wired and gated behind auth.

test("event setup wizard route is auth-gated (redirects to login)", async ({ page }) => {
  await page.goto("/orgs/acme/events/new");
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/login/);
});
