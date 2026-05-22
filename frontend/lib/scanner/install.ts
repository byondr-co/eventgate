"use client";

/**
 * Capture the `beforeinstallprompt` event so we can show our own "Install"
 * button. Chrome / Edge / Samsung Internet expose this; iOS Safari does not
 * (users must use the share sheet's "Add to Home Screen").
 *
 * Module-level singleton: the event fires once per page load, so we stash it
 * and let `useInstallPrompt()` subscribe to changes via useSyncExternalStore.
 * SSR-safe: the server snapshot returns false, so React's hydration sees a
 * matching tree on the first paint regardless of whether the browser has
 * already fired beforeinstallprompt.
 */

import { useSyncExternalStore } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

const getSnapshot = (): boolean => deferred !== null;
const getServerSnapshot = (): boolean => false;

export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const canInstall = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    canInstall,
    install: async () => {
      const d = deferred;
      if (!d) return;
      await d.prompt();
      await d.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
    },
  };
}
