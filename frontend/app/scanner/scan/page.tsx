"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CameraView } from "@/components/scanner/camera-view";
import { ManualTokenEntry } from "@/components/scanner/manual-token-entry";
import { ResultCard } from "@/components/scanner/result-card";
import { postCheckin, type CheckinOutcome } from "@/lib/scanner/api";
import { useBarcodeDetectorSupport } from "@/lib/scanner/camera";
import { useDeviceIdentity } from "@/lib/scanner/session";

const RESULT_CARD_MS = 1800; // brief specifies ≥1.5s; +300ms breathing room

function uuid(): string {
  // crypto.randomUUID is HTTPS-only but localhost is exempt. Fallback for old
  // browsers — Math.random is fine for idempotency keys (not cryptographic).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ScannerScanPage() {
  const router = useRouter();
  const device = useDeviceIdentity();
  const hasBarcodeDetector = useBarcodeDetectorSupport();
  const [outcome, setOutcome] = useState<CheckinOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const submitToken = useCallback(
    async (rawToken: string) => {
      if (!device) return;
      if (busy) return;
      setBusy(true);
      const result = await postCheckin({
        token: rawToken,
        gate: device.label ?? "",
        scanner_label: device.label ?? "",
        client_idempotency_key: uuid(),
      });
      setOutcome(result);
      setBusy(false);
      if (result.kind === "session_expired") {
        // Bounce after the result card has time to show, so the staffer sees
        // why the unlock screen reappeared.
        setTimeout(() => router.replace("/scanner/unlock"), RESULT_CARD_MS);
      }
    },
    [device, busy, router],
  );

  // Auto-dismiss the result card after RESULT_CARD_MS.
  useEffect(() => {
    if (!outcome) return;
    if (outcome.kind === "session_expired") return; // handled by submitToken
    const t = window.setTimeout(() => setOutcome(null), RESULT_CARD_MS);
    return () => clearTimeout(t);
  }, [outcome]);

  if (!device) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-neutral-400">Loading device…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">{device.label}</h1>
        <span className="text-xs text-neutral-400">scanner</span>
      </div>

      {hasBarcodeDetector ? (
        <CameraView paused={!!outcome || busy} onScan={submitToken} />
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-200">
          This browser doesn&apos;t support the camera barcode API. Use manual entry below.
        </div>
      )}

      <div className="mt-6">
        <ManualTokenEntry busy={busy} onSubmit={submitToken} />
      </div>

      {outcome ? <ResultCard outcome={outcome} onDismiss={() => setOutcome(null)} /> : null}
    </main>
  );
}
