import * as React from "react";

import { cn } from "@/lib/utils";

type FieldProps = {
  label: React.ReactNode;
  htmlFor?: string;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
};

function Field({ label, htmlFor, helper, error, optional, className, children }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={cn("space-y-1.5", className)} data-slot="field">
      <label htmlFor={htmlFor} className="flex items-center justify-between text-sm font-semibold">
        <span>{label}</span>
        {optional && <span className="font-normal text-muted-foreground">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p className="text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

export { Field };
