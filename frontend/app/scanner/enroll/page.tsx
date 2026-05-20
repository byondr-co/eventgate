"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { postEnroll } from "@/lib/scanner/api";
import { clearDevice, saveDevice, useDeviceIdentity } from "@/lib/scanner/session";

export default function ScannerEnrollPage() {
  const router = useRouter();
  const device = useDeviceIdentity();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.replace("/scanner/unlock");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Enroll this device</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Paste the one-time enrollment code your event organizer gave you. The device will bind to
        that event until revoked.
      </p>

      {alreadyEnrolled ? (
        <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-950/30 p-4 text-sm">
          <p className="font-medium text-amber-200">
            This device is already enrolled as <span className="font-mono">{alreadyEnrolled}</span>.
          </p>
          <p className="mt-1 text-amber-300/80">
            Enrolling again will overwrite the existing token. Reset first if that&apos;s
            intentional.
          </p>
          <button
            type="button"
            onClick={clearDevice}
            className="mt-3 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:bg-neutral-800"
          >
            Reset & re-enroll
          </button>
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
