"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { startRefreshLoop } from "@/lib/scanner/refresh-loop";
import { loadDevice } from "@/lib/scanner/session";

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

  // Side effects only: SW registration + auth-redirect. No setState here.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (!pathname.startsWith(ENROLL_PATH)) {
      const id = loadDevice();
      if (!id) router.replace(ENROLL_PATH);
    }
    const stopRefresh = startRefreshLoop();
    return () => {
      stopRefresh();
    };
  }, [pathname, router]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs">
        <span className="font-mono">Eventgate Scanner</span>
        <span
          className={online ? "font-mono text-green-400" : "font-mono text-amber-400"}
          aria-live="polite"
        >
          {online ? "● online" : "● offline"}
        </span>
      </header>
      {children}
    </div>
  );
}
