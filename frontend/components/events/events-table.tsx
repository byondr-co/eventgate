"use client";

import Link from "next/link";

import type { VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import type { EventStatus } from "@/lib/events";
import { NoEvents } from "@/lib/illustrations";
import { useEvents } from "@/lib/events";

type BadgeVariant = NonNullable<
  VariantProps<typeof import("@/components/ui/badge").badgeVariants>["variant"]
>;

export function eventStatusVariant(status: EventStatus): BadgeVariant {
  switch (status) {
    case "draft":
      return "outline";
    case "open":
      return "secondary";
    case "live":
      return "default";
    case "closed":
      return "destructive";
    case "archived":
      return "ghost";
    default:
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
        {isLoading && <TableSkeleton />}
        {!isLoading && events.length === 0 && (
          <EmptyState
            illustration={NoEvents}
            title="No events yet"
            message="Create your first event to get a public registration URL."
          />
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
