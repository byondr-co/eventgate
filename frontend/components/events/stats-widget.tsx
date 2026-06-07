"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventStats } from "@/lib/event-stats";

type Tile = { label: string; value: number; tone: "default" | "warning" | "danger" };

export function StatsWidget({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const { data, isLoading } = useEventStats(orgSlug, eventSlug);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const tiles: Tile[] = [
    { label: "Checked in", value: data.checked_in, tone: "default" },
    { label: "Pending", value: data.registered_not_arrived, tone: "default" },
    { label: "Walk-in QR shown", value: data.displayed, tone: "default" },
    {
      label: "Manual review",
      value: data.manual_review,
      tone: data.manual_review > 0 ? "warning" : "default",
    },
    {
      label: "Open escalations",
      value: data.open_escalations,
      tone: data.open_escalations > 0 ? "warning" : "default",
    },
    {
      label: "Conflicts (15m)",
      value: data.conflicts_recent_15min,
      tone: data.conflicts_recent_15min > 0 ? "danger" : "default",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="py-4">
            <div
              className={`text-2xl font-semibold tabular-nums ${
                t.tone === "warning"
                  ? "text-warning"
                  : t.tone === "danger"
                    ? "text-destructive"
                    : ""
              }`}
            >
              {t.value}
            </div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
