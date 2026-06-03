import * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  illustration?: React.FC<{ className?: string }>;
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

function EmptyState({
  illustration: Illustration,
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-border bg-card px-5 py-12 text-center",
        className,
      )}
    >
      {Illustration && <Illustration className="mb-3.5 size-10 text-foreground" />}
      <h3 className="text-base font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState };
