"use client";

import { useEffect, useState } from "react";

import { ConflictRow } from "@/components/scanner/conflict-row";
import { FailedRow } from "@/components/scanner/failed-row";
import { type QueuedMutation } from "@/lib/scanner/db";
import { getConflictMutations, getFailedMutations } from "@/lib/scanner/mutation-queue";

export default function EscalationsPage() {
  const [rows, setRows] = useState<QueuedMutation[]>([]);
  const [failed, setFailed] = useState<QueuedMutation[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [conf, fail] = await Promise.all([getConflictMutations(), getFailedMutations()]);
      if (!active) return;
      setRows(conf);
      setFailed(fail);
    };
    void load();
    return () => {
      active = false;
    };
  }, [tick]);

  const refresh = () => setTick((n) => n + 1);

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="mb-4 text-lg font-semibold">Escalations</h1>
      {rows.length === 0 && failed.length === 0 ? (
        <p className="text-sm text-neutral-400">
          Nothing to escalate. When an offline check-in clashes with another device or exhausts its
          retry budget, it shows up here.
        </p>
      ) : (
        <>
          {rows.length > 0 ? (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.id}>
                  <ConflictRow row={r} onDone={() => void refresh()} />
                </li>
              ))}
            </ul>
          ) : null}
          {failed.length > 0 ? (
            <>
              <h2 className="mt-6 mb-3 text-sm font-semibold text-neutral-300">Failed</h2>
              <ul className="space-y-3">
                {failed.map((r) => (
                  <li key={r.id}>
                    <FailedRow row={r} onDone={() => void refresh()} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
