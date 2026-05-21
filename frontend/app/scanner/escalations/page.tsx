"use client";

import { useEffect, useState } from "react";

import { ConflictRow } from "@/components/scanner/conflict-row";
import { type QueuedMutation } from "@/lib/scanner/db";
import { getConflictMutations } from "@/lib/scanner/mutation-queue";

export default function EscalationsPage() {
  const [rows, setRows] = useState<QueuedMutation[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const next = await getConflictMutations();
      if (active) setRows(next);
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
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No conflicts. When an offline check-in clashes with another device, it shows up here.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <ConflictRow row={r} onDone={() => void refresh()} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
