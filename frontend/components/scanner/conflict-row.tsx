"use client";

import { useState } from "react";

import { type QueuedMutation } from "@/lib/scanner/db";
import { escalateMutation } from "@/lib/scanner/escalations";

type Props = {
  row: QueuedMutation;
  onDone: () => void;
};

export function ConflictRow({ row, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const guest =
    (
      row.server_response as {
        guest?: { full_name?: string; gate?: string; scanner?: string };
      } | null
    )?.guest ?? null;

  const handleEscalate = async () => {
    setBusy(true);
    setErr(null);
    try {
      await escalateMutation(row);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-700/50 bg-amber-950/30 p-4 text-sm">
      <div className="mb-2 font-mono text-xs text-amber-300">CONFLICT</div>
      <div className="space-y-1">
        <div>
          <span className="text-neutral-400">Guest:</span> {guest?.full_name ?? "(unknown)"}
        </div>
        <div>
          <span className="text-neutral-400">Original (this device):</span> {row.payload.gate} /{" "}
          {row.payload.scanner_label}
        </div>
        <div>
          <span className="text-neutral-400">Server says:</span> {guest?.gate ?? "?"} /{" "}
          {guest?.scanner ?? "?"}
        </div>
        <div className="text-xs text-neutral-500">
          Scanned at {new Date(row.created_at).toLocaleTimeString()}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={handleEscalate}
        className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-neutral-950 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send to help desk"}
      </button>
      {err ? <p className="mt-2 text-xs text-red-400">{err}</p> : null}
    </div>
  );
}
