"use client";

import { useParams } from "next/navigation";

import { EventStatusCard } from "@/components/events/event-status-card";
import { GateUtilizationPanel } from "@/components/events/gate-utilization-panel";
import { LiveStatusBadge } from "@/components/events/live-status-badge";
import { PeakWindowPanel } from "@/components/events/peak-window-panel";
import { PublicUrlCard } from "@/components/events/public-url-card";
import { RecentActivityPanel } from "@/components/events/recent-activity-panel";
import { StatsWidget } from "@/components/events/stats-widget";
import { ThroughputPanel } from "@/components/events/throughput-panel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventLive } from "@/lib/event-live";
import { useEvent, type Event } from "@/lib/events";

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

  return <EventDashboardContent event={event} slug={slug} eventSlug={eventSlug} />;
}

function EventDashboardContent({
  event,
  slug,
  eventSlug,
}: {
  event: Event;
  slug: string;
  eventSlug: string;
}) {
  const live = useEventLive(slug, eventSlug);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {event.slug} · {event.status} · {event.venue || "—"}
          </p>
        </div>
        <LiveStatusBadge state={live.connectionState} />
      </div>

      <EventStatusCard event={event} orgSlug={slug} eventSlug={eventSlug} />

      <StatsWidget orgSlug={slug} eventSlug={eventSlug} snapshot={live.snapshot} />

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr_0.9fr]">
          <ThroughputPanel analytics={live.snapshot?.analytics} />
          <GateUtilizationPanel analytics={live.snapshot?.analytics} />
          <PeakWindowPanel analytics={live.snapshot?.analytics} />
        </div>
        <RecentActivityPanel items={live.snapshot?.recent_activity} />
      </div>

      <PublicUrlCard orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
