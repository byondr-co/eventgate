"use client";

import { useSyncExternalStore } from "react";

const DISMISSED_KEY = "scanner:ios-install-banner-dismissed";
const DISMISS_EVENT = "scanner:ios-install-banner-dismissed-change";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPad on iPadOS 13+ reports as "Macintosh" but has touch.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // matchMedia covers Chrome/Edge; navigator.standalone is Safari-specific.
  const mm = window.matchMedia?.("(display-mode: standalone)");
  if (mm?.matches) return true;
  // @ts-expect-error — Safari-only property.
  return Boolean(window.navigator.standalone);
}

function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  if (!isIOS()) return false;
  if (isStandalone()) return false;
  return window.localStorage.getItem(DISMISSED_KEY) !== "1";
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(DISMISS_EVENT, cb);
  return () => window.removeEventListener(DISMISS_EVENT, cb);
}

const getServerSnapshot = () => false;

export function IOSInstallBanner() {
  // useSyncExternalStore avoids "setState in effect" — the visibility is a
  // function of (UA, display-mode, localStorage), all of which are external.
  const show = useSyncExternalStore(subscribe, shouldShow, getServerSnapshot);

  if (!show) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-amber-700/50 bg-amber-950/40 px-4 py-2 text-xs text-amber-200"
    >
      <span>
        iPhone? Tap <span className="font-mono">Share</span> →{" "}
        <span className="font-mono">Add to Home Screen</span> for the full PWA.
      </span>
      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(DISMISSED_KEY, "1");
          window.dispatchEvent(new Event(DISMISS_EVENT));
        }}
        className="font-mono text-amber-300 hover:text-amber-100"
        aria-label="Dismiss install hint"
      >
        ✕
      </button>
    </div>
  );
}
