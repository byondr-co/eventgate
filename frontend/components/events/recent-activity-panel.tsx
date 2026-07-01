"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecentActivity } from "@/lib/event-stats";

function formatTime(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function actionLabel(action: string) {
  return action
    .split(/[._]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function RecentActivityPanel({ items }: { items?: RecentActivity[] }) {
  const rows = items ?? [];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent operational activity.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((item) => {
              const label = actionLabel(item.action);
              const guestLabel = item.guest_label || label;

              return (
                <li key={item.id} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 text-sm">
                  <time
                    className="pt-0.5 text-xs text-muted-foreground tabular-nums"
                    dateTime={item.occurred_at ?? undefined}
                  >
                    {formatTime(item.occurred_at)}
                  </time>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{guestLabel}</div>
                    {item.guest_label ? (
                      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{label}</span>
                        {item.gate ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{item.gate}</span>
                          </>
                        ) : null}
                      </div>
                    ) : item.gate ? (
                      <div className="truncate text-xs text-muted-foreground">{item.gate}</div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
