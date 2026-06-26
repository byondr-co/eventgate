"use client";

import { useParams } from "next/navigation";

import { EventDangerZone } from "@/components/events/event-danger-zone";
import { EventDetailsForm } from "@/components/events/event-details-form";
import { PinManagementCard } from "@/components/events/pin-management-card";
import { WalkinSettingsCard } from "@/components/events/walkin-settings-card";
import { GoogleFormBridgeCard } from "@/components/integrations/google-form-bridge-card";

export default function EventSettingsPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Event settings</h1>
        <p className="text-sm text-muted-foreground">
          Edit event details, door-day controls, and optional pilot integrations.
        </p>
      </div>
      <EventDetailsForm orgSlug={slug} eventSlug={eventSlug} />
      <PinManagementCard orgSlug={slug} eventSlug={eventSlug} />
      <WalkinSettingsCard orgSlug={slug} eventSlug={eventSlug} />
      <GoogleFormBridgeCard orgSlug={slug} eventSlug={eventSlug} />
      <EventDangerZone orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
