"use client";

import type { EventLiveConnectionState } from "@/lib/event-live";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<EventLiveConnectionState, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  polling: "Polling",
};

const STATE_STYLES: Record<EventLiveConnectionState, { badge: string; dot: string }> = {
  connecting: {
    badge: "border-foreground/10 bg-background text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  live: {
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  reconnecting: {
    badge: "border-warning/30 bg-warning/10 text-warning",
    dot: "bg-warning",
  },
  polling: {
    badge: "border-foreground/10 bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

export function LiveStatusBadge({ state }: { state: EventLiveConnectionState }) {
  const styles = STATE_STYLES[state];
  const label = STATE_LABELS[state];

  return (
    <span
      className={cn(
        "inline-flex h-7 w-28 items-center justify-center gap-2 rounded-md border px-2 text-xs font-medium tabular-nums",
        styles.badge,
      )}
      aria-label={`Live connection status: ${label}`}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", styles.dot)} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}
