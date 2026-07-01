"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventAnalytics } from "@/lib/event-stats";

export function ThroughputPanel({ analytics }: { analytics?: EventAnalytics }) {
  const throughput = analytics?.throughput_5m;
  const points = analytics?.trend_60m.slice(-60) ?? [];
  const maxCheckins = Math.max(1, ...points.map((point) => point.checkins));

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">Throughput</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl leading-none font-semibold tabular-nums">
          {throughput?.per_minute ?? 0}/min
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {throughput?.checkins ?? 0} check-ins in 5m
        </div>
        <div
          className="mt-4 flex h-12 items-end gap-1 overflow-hidden"
          role="img"
          aria-label="60 minute check-in trend"
        >
          {points.length > 0 ? (
            points.map((point, index) => (
              <div
                key={`${point.bucket_start ?? "empty"}-${index}`}
                className="min-w-1 flex-1 rounded-sm bg-primary/65"
                style={{ height: `${Math.max(4, (point.checkins / maxCheckins) * 100)}%` }}
              />
            ))
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
              No trend data yet
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
