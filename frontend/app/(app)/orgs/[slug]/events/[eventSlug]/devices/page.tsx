"use client";

import { SmartphoneIcon } from "lucide-react";
import { useParams } from "next/navigation";

import { Guide, type GuideStep } from "@/components/common/guide";
import { DeviceCreateForm } from "@/components/events/device-create-form";
import { DeviceTable } from "@/components/events/device-table";
import { CopyCode, DeviceCreate, EnterPin, OpenEnrollPage } from "@/lib/illustrations";

const SETUP_STEPS: GuideStep[] = [
  {
    illustration: DeviceCreate,
    title: "Create a device",
    body: "Pick a role (Pre-reg scanner or Walk-in display) and a clear label like “Gate 1 Lane A”.",
  },
  {
    illustration: CopyCode,
    title: "Copy the code",
    body: "Each device gets a one-time enrollment code.",
  },
  {
    illustration: OpenEnrollPage,
    title: "Open the enrollment page",
    body: "On that phone or tablet, open the enroll page and paste the code.",
  },
  {
    illustration: EnterPin,
    title: "Enter the event PIN",
    body: "Unlock, and it lands on its scanner or walk-in screen.",
  },
];

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

      <section className="space-y-4">
        <h2 className="text-base font-semibold">How to set up a device</h2>
        <Guide steps={SETUP_STEPS} />
        <div className="space-y-1.5">
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
        </div>
      </section>

      <DeviceCreateForm orgSlug={slug} eventSlug={eventSlug} />
      <DeviceTable orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
