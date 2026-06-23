"use client";

import { RegistrationFormBuilder } from "@/components/events/registration-form-builder";
import { StepNav } from "@/components/wizard/step-nav";

export function NativeStep({
  orgSlug,
  eventSlug,
  onNext,
  onBack,
}: {
  orgSlug: string;
  eventSlug: string;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <RegistrationFormBuilder orgSlug={orgSlug} eventSlug={eventSlug} />
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}
