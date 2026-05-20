"use client";

import { useParams } from "next/navigation";

import { DeviceCreateForm } from "@/components/events/device-create-form";
import { DeviceTable } from "@/components/events/device-table";

export default function EventDevicesPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scanner devices</h1>
        <p className="text-sm text-muted-foreground">
          Enroll scanners (pre-reg check-in) and walk-in displays. Each device gets a one-time code;
          the device itself exchanges it for a durable token at{" "}
          <span className="font-mono">/scanner/enroll</span>.
        </p>
      </div>
      <DeviceCreateForm orgSlug={slug} eventSlug={eventSlug} />
      <DeviceTable orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
