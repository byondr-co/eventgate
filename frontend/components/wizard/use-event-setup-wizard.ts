"use client";
import { useCallback, useMemo, useState } from "react";
import type { WizardStepMeta } from "./wizard-shell";

export type RegistrationKind = "native" | "google";
export type StepId = "basics" | "registration" | "configure" | "review" | "live";

const STEPS: { id: StepId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "registration", label: "Registration" },
  { id: "configure", label: "Configure" },
  { id: "review", label: "Review" },
  { id: "live", label: "Go live" },
];

export function useEventSetupWizard(_orgSlug: string) {
  const [stepId, setStepId] = useState<StepId>("basics");
  const [registrationKind, setRegistrationKind] = useState<RegistrationKind>("native");
  const [eventSlug, setEventSlug] = useState<string | null>(null);

  const steps: WizardStepMeta[] = STEPS;
  const order = useMemo(() => STEPS.map((s) => s.id), []);

  const goTo = useCallback((id: StepId) => setStepId(id), []);
  const goNext = useCallback(() => {
    setStepId((cur) => order[Math.min(order.indexOf(cur) + 1, order.length - 1)]);
  }, [order]);
  const goBack = useCallback(() => {
    setStepId((cur) => order[Math.max(order.indexOf(cur) - 1, 0)]);
  }, [order]);

  return {
    stepId,
    steps,
    registrationKind,
    setRegistrationKind,
    goNext,
    goBack,
    goTo,
    eventSlug,
    setEventSlug,
  };
}
