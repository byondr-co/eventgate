"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import { InstallButton } from "@/components/scanner/install-button";
import { IOSInstallBanner } from "@/components/scanner/ios-install-banner";
import { OfflineBanner } from "@/components/scanner/offline-banner";
import { useQueueCount } from "@/lib/scanner/queue-observers";
import { startRefreshLoop } from "@/lib/scanner/refresh-loop";
import { initScannerSentry } from "@/lib/scanner/sentry";
import { loadDevice } from "@/lib/scanner/session";
import { startSyncLoop } from "@/lib/scanner/sync";

const ENROLL_PATH = "/scanner/enroll";

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const getOnline = () => navigator.onLine;
const getOnlineServer = () => true;

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  // Enroll + unlock adopt the light theme (Plan M). Scan/escalations stay dark.
  const isLight = pathname === "/scanner/enroll" || pathname === "/scanner/unlock";
  // useSyncExternalStore avoids the "setState in effect" lint trap — the
  // browser is the source of truth, we just subscribe and re-render.
  const online = useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer);
  const pending = useQueueCount("pending");
  const conflicts = useQueueCount("conflict");

  // Side effects only: SW registration + auth-redirect. No setState here.
  useEffect(() => {
    void initScannerSentry();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (!pathname.startsWith(ENROLL_PATH)) {
      const id = loadDevice();
      if (!id) router.replace(ENROLL_PATH);
    }
    const stopRefresh = startRefreshLoop();
    const stopSync = startSyncLoop();
    return () => {
      stopRefresh();
      stopSync();
    };
  }, [pathname, router]);

  return (
    <div
      className={cn(
        "min-h-screen",
        isLight ? "bg-background text-foreground" : "bg-neutral-950 text-white",
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between border-b px-4 py-2 text-xs",
          isLight ? "border-neutral-200" : "border-neutral-800",
        )}
      >
        <span className="font-mono">Eventgate Scanner</span>
        <div className="flex items-center gap-3">
          <InstallButton />
          {conflicts > 0 ? (
            <Link
              href="/scanner/escalations"
              className={cn(
                "font-mono hover:underline",
                isLight ? "text-amber-700" : "text-amber-300",
              )}
              aria-label={`${conflicts} conflicts pending escalation`}
            >
              ⚠ {conflicts} conflict{conflicts === 1 ? "" : "s"}
            </Link>
          ) : null}
          <span
            className={cn(
              "font-mono",
              online
                ? isLight
                  ? "text-green-600"
                  : "text-green-400"
                : isLight
                  ? "text-amber-600"
                  : "text-amber-400",
            )}
            aria-live="polite"
          >
            {online ? "● online" : `● offline${pending > 0 ? ` — ${pending} queued` : ""}`}
          </span>
        </div>
      </header>
      <OfflineBanner />
      <IOSInstallBanner />
      {children}
    </div>
  );
}
