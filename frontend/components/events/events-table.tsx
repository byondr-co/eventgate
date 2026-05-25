"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventStatus } from "@/lib/events";
import { useEvents } from "@/lib/events";

export function eventStatusVariant(
  status: EventStatus,
): "default" | "secondary" | "outline" | "destructive" | "ghost" | "link" {
  switch (status) {
    case "draft":
      return "secondary";
    case "open":
      return "default";
    case "live":
      return "default";
    case "closed":
      return "outline";
    case "archived":
      return "outline";
  }
}

export function EventsTable({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading } = useEvents(orgSlug);
  const events = data?.results ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Events
          <Link
            href={`/orgs/${orgSlug}/events/new`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            New event
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && events.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No events yet. Create your first one to get a public registration URL.
          </p>
        )}
        {events.length > 0 && (
          <ul className="divide-y">
            {events.map((e) => (
              <li key={e.id} className="py-2 flex items-center justify-between">
                <Link
                  href={`/orgs/${orgSlug}/events/${e.slug}`}
                  className="text-sm hover:underline"
                >
                  {e.name}
                </Link>
                <Badge variant={eventStatusVariant(e.status)}>{e.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
