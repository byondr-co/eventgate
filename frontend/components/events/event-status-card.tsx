"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EVENT_TRANSITIONS, useTransitionEvent } from "@/lib/events";
import type { EventStatus } from "@/lib/events";
import { eventStatusVariant } from "./events-table";

type EventLike = {
  status: EventStatus;
  name?: string;
  slug?: string;
};

type Props = {
  event: EventLike;
  orgSlug: string;
  eventSlug: string;
};

export function EventStatusCard({ event, orgSlug, eventSlug }: Props) {
  const mutation = useTransitionEvent(orgSlug, eventSlug);
  const transitions = EVENT_TRANSITIONS[event.status];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={eventStatusVariant(event.status)}>{event.status}</Badge>

          {transitions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {transitions.map(({ target, label }) => (
                <Button
                  key={target}
                  variant="outline"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(target)}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {event.status === "archived" && (
          <p className="mt-2 text-xs text-muted-foreground">Archived events cannot be modified.</p>
        )}

        {mutation.isError && (
          <p className="mt-2 text-xs text-destructive">{(mutation.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
