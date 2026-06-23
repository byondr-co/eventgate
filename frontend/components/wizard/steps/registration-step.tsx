"use client";

import { IllustrationChoice } from "@/components/illustrations";
import { ChoiceCard } from "@/components/wizard/choice-card";
import { StepNav } from "@/components/wizard/step-nav";
import type { RegistrationKind } from "@/components/wizard/use-event-setup-wizard";

export function RegistrationStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: RegistrationKind;
  onChange: (k: RegistrationKind) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">How will guests register?</p>
      <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          selected={value === "native"}
          onSelect={() => onChange("native")}
          title="Eventgate form"
          description="Share a link or QR. No setup, no Google. Recommended."
          icon={<IllustrationChoice />}
        />
        <ChoiceCard
          selected={value === "google"}
          onSelect={() => onChange("google")}
          title="Google Form"
          description="Connect an existing Google Form. A few guided steps."
        />
      </div>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}
