"use client";

import { useParams } from "next/navigation";

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
          Door-day controls, walk-in capacity, and optional pilot integrations.
        </p>
      </div>
      <PinManagementCard orgSlug={slug} eventSlug={eventSlug} />
      <WalkinSettingsCard orgSlug={slug} eventSlug={eventSlug} />
      <GoogleFormBridgeCard orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
