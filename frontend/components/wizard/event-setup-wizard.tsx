"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useTransitionEvent } from "@/lib/events";
import { BasicsStep } from "@/components/wizard/steps/basics-step";
import { BridgeStep } from "@/components/wizard/steps/bridge-step";
import { NativeStep } from "@/components/wizard/steps/native-step";
import { RegistrationStep } from "@/components/wizard/steps/registration-step";
import { ReviewStep } from "@/components/wizard/steps/review-step";
import { useEventSetupWizard } from "@/components/wizard/use-event-setup-wizard";
import { WizardShell } from "@/components/wizard/wizard-shell";

export function EventSetupWizard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const w = useEventSetupWizard(orgSlug);
  const [eventName, setEventName] = useState("");
  const [goingLive, setGoingLive] = useState(false);
  const transition = useTransitionEvent(orgSlug, w.eventSlug ?? "");

  const dashboardHref = w.eventSlug ? `/orgs/${orgSlug}/events/${w.eventSlug}` : null;

  const goLive = async () => {
    if (!w.eventSlug) return;
    setGoingLive(true);
    try {
      await transition.mutateAsync("open");
      router.push(`/orgs/${orgSlug}/events/${w.eventSlug}`);
    } catch {
      setGoingLive(false);
    }
  };

  return (
    <WizardShell
      title="Set up your event"
      steps={w.steps}
      currentStepId={w.stepId}
      onSaveExit={dashboardHref ? () => router.push(dashboardHref) : undefined}
    >
      {w.stepId === "basics" && (
        <BasicsStep
          orgSlug={orgSlug}
          onCreated={(slug, name) => {
            w.setEventSlug(slug);
            setEventName(name);
            w.goNext();
          }}
        />
      )}
      {w.stepId === "registration" && (
        <RegistrationStep
          value={w.registrationKind}
          onChange={w.setRegistrationKind}
          onNext={w.goNext}
          onBack={w.goBack}
        />
      )}
      {w.stepId === "configure" && w.registrationKind === "native" && w.eventSlug && (
        <NativeStep orgSlug={orgSlug} eventSlug={w.eventSlug} onNext={w.goNext} onBack={w.goBack} />
      )}
      {w.stepId === "configure" && w.registrationKind === "google" && w.eventSlug && (
        <BridgeStep orgSlug={orgSlug} eventSlug={w.eventSlug} onDone={w.goNext} onBack={w.goBack} />
      )}
      {w.stepId === "review" && (
        <ReviewStep
          eventName={eventName}
          registrationKind={w.registrationKind}
          onBack={w.goBack}
          onGoLive={goLive}
          pending={goingLive}
        />
      )}
    </WizardShell>
  );
}
