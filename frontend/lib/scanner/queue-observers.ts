"use client";

/**
 * Small hooks that observe the mutation_queue.
 *
 * Dexie has its own observable layer, but pulling it in just for two counters
 * is overkill. A 1-second poll while the layout is mounted is fine — Dexie
 * reads are cheap and the data fits in memory.
 */

import { useEffect, useState } from "react";

import { countByStatus } from "./mutation-queue";

export function useQueueCount(status: "pending" | "conflict" | "failed"): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const v = await countByStatus(status);
      if (alive) setN(v);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [status]);
  return n;
}
