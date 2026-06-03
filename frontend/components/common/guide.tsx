import * as React from "react";

import { cn } from "@/lib/utils";

export type GuideStep = {
  illustration: React.FC<{ className?: string }>;
  title: React.ReactNode;
  body?: React.ReactNode;
};

type GuideProps = {
  steps: GuideStep[];
  className?: string;
};

function Guide({ steps, className }: GuideProps) {
  return (
    <ol className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {steps.map((step, i) => {
        const Illustration = step.illustration;
        return (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <Illustration className="size-8 text-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">{i + 1}</span>
            </div>
            <p className="text-sm font-semibold">{step.title}</p>
            {step.body && <p className="text-xs text-muted-foreground">{step.body}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export { Guide };
