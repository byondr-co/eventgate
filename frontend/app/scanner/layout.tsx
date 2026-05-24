"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

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
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs">
        <span className="font-mono">Gatethres Scanner</span>
        <div className="flex items-center gap-3">
          <InstallButton />
          {conflicts > 0 ? (
            <Link
              href="/scanner/escalations"
              className="font-mono text-amber-300 hover:underline"
              aria-label={`${conflicts} conflicts pending escalation`}
            >
              ⚠ {conflicts} conflict{conflicts === 1 ? "" : "s"}
            </Link>
          ) : null}
          <span
            className={online ? "font-mono text-green-400" : "font-mono text-amber-400"}
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
