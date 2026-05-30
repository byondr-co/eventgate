"use client";

import React, { useEffect } from "react";

const REFRESH_BEFORE_EXPIRY_MS = 23 * 60 * 60 * 1000; // 23h (token is 1d)

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function setupSilentRefresh(): void {
  teardownSilentRefresh();
  refreshTimer = setTimeout(async () => {
    try {
      const res = await fetch("/api/v1/auth/refresh/", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        // Re-arm the timer for the next cycle
        setupSilentRefresh();
      } else {
        // Refresh failed — redirect to login on next 401 (handled by apiFetch wrapper)
      }
    } catch {
      // Network error — let the next apiFetch hit a 401 and redirect
    }
  }, REFRESH_BEFORE_EXPIRY_MS);
}

export function teardownSilentRefresh(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

export function SessionRefreshProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setupSilentRefresh();
    return () => teardownSilentRefresh();
  }, []);
  return React.createElement(React.Fragment, null, children);
}
