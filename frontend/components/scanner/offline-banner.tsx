"use client";

import { useSyncExternalStore } from "react";

import { useQueueCount } from "@/lib/scanner/queue-observers";

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

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer);
  const pending = useQueueCount("pending");
  if (online) return null;
  return (
    <div className="border-b border-amber-600/40 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-200">
      Working offline{" "}
      {pending > 0
        ? `— ${pending} scan${pending === 1 ? "" : "s"} queued, will sync when you reconnect.`
        : `— scans will sync when you reconnect.`}
    </div>
  );
}
