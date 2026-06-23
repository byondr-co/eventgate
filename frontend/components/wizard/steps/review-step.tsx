"use client";

import { StepNav } from "@/components/wizard/step-nav";
import type { RegistrationKind } from "@/components/wizard/use-event-setup-wizard";

export function ReviewStep({
  eventName,
  registrationKind,
  onBack,
  onGoLive,
  pending,
}: {
  eventName: string;
  registrationKind: RegistrationKind;
  onBack: () => void;
  onGoLive: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-4">
      <dl className="rounded-lg border p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Event</dt>
          <dd>{eventName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Registration</dt>
          <dd>{registrationKind === "native" ? "Eventgate form" : "Google Form"}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">Going live opens registration for this event.</p>
      <StepNav
        onBack={onBack}
        onNext={onGoLive}
        nextLabel={pending ? "Going live…" : "Go live"}
        nextDisabled={pending}
      />
    </div>
  );
}
