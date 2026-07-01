"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventAnalytics } from "@/lib/event-stats";

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatWindow(start?: string | null, end?: string | null) {
  if (!start || !end) return "No peak yet";
  return `${formatTime(start)} - ${formatTime(end)}`;
}

export function PeakWindowPanel({ analytics }: { analytics?: EventAnalytics }) {
  const peak = analytics?.peak_5m;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">Peak 5m Window</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl leading-none font-semibold tabular-nums">
          {peak?.checkins ?? 0}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {formatWindow(peak?.window_start, peak?.window_end)}
        </div>
        <div className="mt-3 text-xs font-medium text-muted-foreground tabular-nums">
          {peak?.per_minute ?? 0}/min peak
        </div>
      </CardContent>
    </Card>
  );
}
