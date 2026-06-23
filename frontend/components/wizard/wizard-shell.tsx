"use client";
import type { ReactNode } from "react";
import { StepTransition } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WizardStepMeta = { id: string; label: string };

export function WizardShell({
  title,
  steps,
  currentStepId,
  onSaveExit,
  children,
}: {
  title: string;
  steps: WizardStepMeta[];
  currentStepId: string;
  onSaveExit?: () => void;
  children: ReactNode;
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {onSaveExit && (
          <Button type="button" variant="ghost" onClick={onSaveExit}>
            Save &amp; exit
          </Button>
        )}
      </div>
      <ol className="flex gap-2" aria-label="Progress">
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.id === currentStepId ? "step" : undefined}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= currentIndex ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </ol>
      <StepTransition stepKey={currentStepId}>{children}</StepTransition>
    </div>
  );
}
