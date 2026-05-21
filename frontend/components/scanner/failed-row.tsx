"use client";

import { useState } from "react";

import { type QueuedMutation } from "@/lib/scanner/db";
import { retryFailedMutation } from "@/lib/scanner/mutation-queue";

type Props = {
  row: QueuedMutation;
  onDone: () => void;
};

export function FailedRow({ row, onDone }: Props) {
  const [busy, setBusy] = useState(false);

  const handleRetry = async () => {
    setBusy(true);
    try {
      await retryFailedMutation(row.id);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-red-700/50 bg-red-950/30 p-4 text-sm">
      <div className="mb-2 font-mono text-xs text-red-300">FAILED</div>
      <div className="space-y-1">
        <div>
          <span className="text-neutral-400">Token:</span>{" "}
          <span className="font-mono text-xs">{row.target_token.slice(0, 16)}…</span>
        </div>
        <div>
          <span className="text-neutral-400">Reason:</span> {row.last_error ?? "unknown"}
        </div>
        <div className="text-xs text-neutral-500">
          Scanned at {new Date(row.created_at).toLocaleTimeString()} · attempts={row.attempts}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleRetry()}
        className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Retry
      </button>
    </div>
  );
}
