"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvent } from "@/lib/events";

export default function EventDashboardPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const { data: event, isLoading } = useEvent(slug, eventSlug);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!event) return <p className="text-sm text-destructive">Event not found.</p>;

  const publicUrl = `/e/${slug}/${eventSlug}/register`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {event.slug} · {event.status} · {event.venue || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/orgs/${slug}/events/${eventSlug}/form`}
            className={buttonVariants({ variant: "outline" })}
          >
            Form
          </Link>
          <Link
            href={`/orgs/${slug}/events/${eventSlug}/guests`}
            className={buttonVariants({ variant: "outline" })}
          >
            Guests
          </Link>
          <Link
            href={`/orgs/${slug}/events/${eventSlug}/devices`}
            className={buttonVariants({ variant: "outline" })}
          >
            Devices
          </Link>
          <Link
            href={`/orgs/${slug}/events/${eventSlug}/helpdesk`}
            className={buttonVariants({ variant: "outline" })}
          >
            Help desk
          </Link>
          <Link
            href={`/orgs/${slug}/events/${eventSlug}/settings`}
            className={buttonVariants({ variant: "outline" })}
          >
            Settings
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Public registration link</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-mono break-all">{publicUrl}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Share this URL with attendees. Counts and live arrivals land in Plan D.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
