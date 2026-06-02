"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { postUnlock } from "@/lib/scanner/api";
import { primeGuestCache } from "@/lib/scanner/guest-cache";
import { ROLE_LABELS, ROLE_LANDING } from "@/lib/scanner/roles";
import { clearDevice, saveSession, useDeviceIdentity } from "@/lib/scanner/session";

export default function ScannerUnlockPage() {
  const router = useRouter();
  const device = useDeviceIdentity();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!device) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-neutral-400">Loading device…</p>
      </main>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await postUnlock(device.device_token, pin.trim());
      saveSession({ session_token: r.session_token, expires_at: r.expires_at });
      try {
        await primeGuestCache({
          orgSlug: device.org_slug,
          eventSlug: device.event_slug,
          sessionToken: r.session_token,
        });
      } catch (err) {
        // Non-fatal: scanner still works online, the cache will fill on next refresh.
        console.warn("primeGuestCache failed", err);
      }
      router.replace(ROLE_LANDING[device.role]);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const onReset = () => {
    clearDevice();
    router.replace("/scanner/enroll");
  };

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Unlock</h1>
      <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-400">Device</p>
        <p className="mt-1 text-base font-medium">{device.label}</p>
        <p className="mt-1 text-sm text-neutral-400">
          <span className="font-mono">{device.org_slug}</span>
          {" / "}
          <span className="font-mono">{device.event_slug}</span>
          {" · "}
          {ROLE_LABELS[device.role]}
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Event PIN</span>
          <input
            required
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-4 py-4 text-center font-mono text-2xl tracking-[0.5em]"
            placeholder="• • • •"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !pin}
          className="w-full rounded-md bg-white px-4 py-3 text-base font-medium text-neutral-950 disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </form>

      <div className="mt-8 border-t border-neutral-800 pt-4">
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-neutral-500 underline hover:text-neutral-300"
        >
          Not this device? Re-enroll
        </button>
      </div>
    </main>
  );
}
