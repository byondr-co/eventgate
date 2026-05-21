"use client";

/**
 * Capture the `beforeinstallprompt` event so we can show our own "Install"
 * button. Chrome / Edge / Samsung Internet expose this; iOS Safari does not
 * (users must use the share sheet's "Add to Home Screen").
 *
 * Module-level singleton: the event fires once per page load, so we stash it
 * and let `useInstallPrompt()` subscribe to changes via a small set of
 * listeners.
 */

import { useEffect, useState } from "react";

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

export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    canInstall: deferred !== null,
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
