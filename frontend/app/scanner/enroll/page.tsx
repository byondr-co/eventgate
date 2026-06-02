"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { postEnroll, postUnlock } from "@/lib/scanner/api";
import { ROLE_LABELS, ROLE_LANDING } from "@/lib/scanner/roles";
import { clearDevice, loadSession, saveDevice, useDeviceIdentity } from "@/lib/scanner/session";

export default function ScannerEnrollPage() {
  const router = useRouter();
  const device = useDeviceIdentity();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PIN-gated reset flow.
  const [resetting, setResetting] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const alreadyEnrolled = device ? `${device.label} (${device.event_slug})` : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const trimmed = code.trim();
      if (!trimmed) throw new Error("Enter the code given by the event organizer.");
      const r = await postEnroll(trimmed);
      saveDevice({
        device_id: r.device_id,
        device_token: r.device_token,
        event_id: r.event_id,
        event_slug: r.event_slug,
        org_slug: r.org_slug,
        label: r.label,
        role: r.role,
      });
      // Keep `busy` true through the navigation: saveDevice() populates the
      // device synchronously (useSyncExternalStore re-renders), and without this
      // the "already enrolled" banner would flash for a frame before we leave.
      router.replace("/scanner/unlock");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  // Jump straight to this device's working screen (so staff don't have to type a
  // URL, especially in the installed PWA). Unlock first if the session is gone.
  const onResume = () => {
    if (!device) return;
    router.replace(loadSession() ? ROLE_LANDING[device.role] : "/scanner/unlock");
  };

  const onConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;
    setResetError(null);
    setResetBusy(true);
    try {
      // Verify the event PIN before wiping the device token.
      await postUnlock(device.device_token, resetPin.trim());
      clearDevice();
      setResetting(false);
      setResetPin("");
    } catch (err) {
      setResetError((err as Error).message);
    } finally {
      setResetBusy(false);
    }
  };

  const showResume = device && device.role !== "helpdesk";

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Enroll this device</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Paste the one-time enrollment code your event organizer gave you. The device will bind to
        that event until revoked.
      </p>

      {alreadyEnrolled && !busy ? (
        <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-950/30 p-4 text-sm">
          <p className="font-medium text-amber-200">
            This device is already enrolled as <span className="font-mono">{alreadyEnrolled}</span>.
          </p>
          <p className="mt-1 text-amber-300/80">
            Enrolling again will overwrite the existing token. Reset first if that&apos;s
            intentional.
          </p>

          {showResume ? (
            <button
              type="button"
              onClick={onResume}
              className="mt-3 block w-full rounded-md bg-white px-4 py-2.5 text-center text-sm font-medium text-neutral-950"
            >
              Open {ROLE_LABELS[device.role]}
            </button>
          ) : null}

          {!resetting ? (
            <button
              type="button"
              onClick={() => setResetting(true)}
              className="mt-3 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:bg-neutral-800"
            >
              Reset &amp; re-enroll
            </button>
          ) : (
            <form onSubmit={onConfirmReset} className="mt-3 space-y-2">
              <label className="block">
                <span className="text-xs text-amber-300/80">Enter the event PIN to reset</span>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  value={resetPin}
                  onChange={(e) => setResetPin(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-center font-mono text-lg tracking-[0.4em]"
                  placeholder="• • • •"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={resetBusy || !resetPin}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {resetBusy ? "Verifying…" : "Confirm reset"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetting(false);
                    setResetPin("");
                    setResetError(null);
                  }}
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
              {resetError ? <p className="text-xs text-red-400">{resetError}</p> : null}
            </form>
          )}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Enrollment code</span>
          <textarea
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={3}
            placeholder="Paste here"
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm break-all"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-white px-4 py-3 text-base font-medium text-neutral-950 disabled:opacity-50"
        >
          {busy ? "Enrolling…" : "Enroll device"}
        </button>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </form>
    </main>
  );
}
