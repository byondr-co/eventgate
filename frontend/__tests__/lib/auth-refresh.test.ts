import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { setupSilentRefresh, teardownSilentRefresh } from "@/lib/auth-refresh";

describe("auth-refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response),
    );
  });

  afterEach(() => {
    teardownSilentRefresh();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("schedules a refresh ~23h after setup", () => {
    setupSilentRefresh();
    expect(global.fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(23 * 60 * 60 * 1000 + 100);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/auth/refresh/",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("teardown cancels the scheduled refresh", () => {
    setupSilentRefresh();
    teardownSilentRefresh();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
