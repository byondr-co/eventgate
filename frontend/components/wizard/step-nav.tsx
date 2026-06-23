"use client";
import { Button } from "@/components/ui/button";

export function StepNav({
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled,
  backDisabled,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  backDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <Button type="button" variant="ghost" onClick={onBack} disabled={backDisabled || !onBack}>
        Back
      </Button>
      <Button type="button" onClick={onNext} disabled={nextDisabled || !onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}
