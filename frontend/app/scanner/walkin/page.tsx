"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { WalkinDisplay } from "@/components/scanner/walkin-display";
import { postWalkinDisplayNext, type WalkinDisplayResponse } from "@/lib/scanner/api";
import { useDeviceIdentity } from "@/lib/scanner/session";

const POLL_INTERVAL_MS = 5000;

export default function ScannerWalkinPage() {
  const router = useRouter();
  const device = useDeviceIdentity();
  const [data, setData] = useState<WalkinDisplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!device) return;
    if (device.role !== "walkin_display") {
      // Defensive — unlock should already route by role, but if a staffer
      // navigates here manually we bounce them to the unlock screen.
      router.replace("/scanner/unlock");
      return;
    }

    let active = true;
    const gate = device.label;
    const scannerLabel = device.label;

    const poll = async () => {
      if (!active || inFlight.current) return;
      inFlight.current = true;
      const result = await postWalkinDisplayNext({ gate, scanner_label: scannerLabel });
      inFlight.current = false;
      if (!active) return;

      if (result.kind === "ready") {
        setData((prev) => {
          if (prev && prev.entry_token === result.data.entry_token) return prev;
          return result.data;
        });
        setError(null);
      } else if (result.kind === "session_expired") {
        router.replace("/scanner/unlock");
      } else {
        setError(result.detail);
      }
    };

    poll();
    const t = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [device, router]);

  if (!device) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-neutral-400">Loading device…</p>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-red-400">Walk-in display unavailable: {error}</p>
        <p className="mt-2 text-xs text-neutral-500">
          Will retry every {POLL_INTERVAL_MS / 1000}s.
        </p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-neutral-400">Loading walk-in…</p>
      </main>
    );
  }

  return <WalkinDisplay claimUrl={data.claim_url} gate={device.label} scanner={device.label} />;
}
