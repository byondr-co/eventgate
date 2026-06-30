"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventAnalytics } from "@/lib/event-stats";

function utilizationWidth(share: number) {
  return `${Math.min(100, Math.max(4, share * 100))}%`;
}

export function GateUtilizationPanel({ analytics }: { analytics?: EventAnalytics }) {
  const rows = analytics?.gate_utilization_15m ?? [];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">Gate Utilization</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gate activity in the last 15 minutes.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={`${row.gate}-${row.scanner}`} className="space-y-2">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.gate}</div>
                    <div className="truncate text-xs text-muted-foreground">{row.scanner}</div>
                  </div>
                  <div className="shrink-0 font-medium tabular-nums">
                    {Math.round(row.share * 100)}%
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: utilizationWidth(row.share) }}
                  />
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {row.checkins} check-ins · {row.per_minute}/min
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
