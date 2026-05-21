"use client";

/**
 * Dynamically import the Sentry browser SDK on the scanner shell only.
 * Keeps the dashboard / public-page bundle small.
 *
 * The actual SDK init happens in `sentry.client.config.ts` at the frontend
 * root. We dynamic-import that file from here so it only loads on
 * `/scanner/*` routes (the layout effect calls `initScannerSentry()` once
 * on mount).
 */

let initialized = false;

export async function initScannerSentry(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  await import("../../sentry.client.config");
}
