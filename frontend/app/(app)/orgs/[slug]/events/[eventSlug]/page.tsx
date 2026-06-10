"use client";

import { useParams } from "next/navigation";

import { EventStatusCard } from "@/components/events/event-status-card";
import { PublicUrlCard } from "@/components/events/public-url-card";
import { StatsWidget } from "@/components/events/stats-widget";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent } from "@/lib/events";

export function EventDashboardSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-16" />
          </CardHeader>
          <CardContent className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function EventDashboardPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const { data: event, isLoading } = useEvent(slug, eventSlug);

  if (isLoading) return <EventDashboardSkeleton />;
  if (!event) return <p className="text-sm text-destructive">Event not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        <p className="text-sm text-muted-foreground">
          {event.slug} · {event.status} · {event.venue || "—"}
        </p>
      </div>

      <EventStatusCard event={event} orgSlug={slug} eventSlug={eventSlug} />

      <StatsWidget orgSlug={slug} eventSlug={eventSlug} />

      <PublicUrlCard orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
