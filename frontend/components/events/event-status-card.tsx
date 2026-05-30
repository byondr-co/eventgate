"use client";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
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

  const onClick = (target: EventStatus, label: string) => {
    mutation.mutate(target, {
      onSuccess: () => toast.success(`Event status changed: ${label}`),
      onError: (err) => toast.error(extractApiError(err)),
    });
  };

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
                  onClick={() => onClick(target, label)}
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
      </CardContent>
    </Card>
  );
}
