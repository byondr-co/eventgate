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

const STEP_GRID: Record<1 | 2 | 3 | 4, string> = {
  1: "", // single column everywhere
  2: "sm:grid-cols-2", // 2-up from sm; no lg class needed
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

function Guide({ steps, className }: GuideProps) {
  const cols = Math.min(Math.max(steps.length, 1), 4) as 1 | 2 | 3 | 4;
  return (
    <ol className={cn("grid gap-4", STEP_GRID[cols], className)}>
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
