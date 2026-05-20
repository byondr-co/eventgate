"use client";

import { useParams } from "next/navigation";

import { PinManagementCard } from "@/components/events/pin-management-card";

export default function EventSettingsPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Event settings</h1>
        <p className="text-sm text-muted-foreground">
          Door-day controls: PIN rotation now, more in Plan F.
        </p>
      </div>
      <PinManagementCard orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
