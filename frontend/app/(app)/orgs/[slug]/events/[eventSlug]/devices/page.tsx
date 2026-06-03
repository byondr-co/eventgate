"use client";

import { SmartphoneIcon } from "lucide-react";
import { useParams } from "next/navigation";

import { DeviceCreateForm } from "@/components/events/device-create-form";
import { DeviceTable } from "@/components/events/device-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EventDevicesPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scanner devices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each phone or tablet at the door enrolls once with a one-time code, then unlocks with the
          event PIN.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to set up a device</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>
              <span className="text-foreground">Create a device</span> below — choose its role
              (Pre-reg scanner or Walk-in display) and a clear label (e.g. “Gate 1 Lane A”).
            </li>
            <li>
              Copy the <span className="text-foreground">one-time enrollment code</span> it
              generates.
            </li>
            <li>
              On that device, open the <span className="text-foreground">enrollment page</span> and
              paste the code.
            </li>
            <li>
              Enter the <span className="text-foreground">event PIN</span> to unlock — the device
              lands on its scanner or walk-in screen.
            </li>
          </ol>
          <a
            href="/scanner/enroll"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <SmartphoneIcon className="size-4" />
            Open the device enrollment page
          </a>
          <p className="text-xs text-muted-foreground">
            Opens <span className="font-mono">/scanner/enroll</span> in a new tab — best done on the
            device itself. If you lose a code, revoke the device and create a new one.
          </p>
        </CardContent>
      </Card>

      <DeviceCreateForm orgSlug={slug} eventSlug={eventSlug} />
      <DeviceTable orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
