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

/**
 * Form field wrapper: label + control + helper/error.
 *
 * When `error` is set, Field wires the a11y attributes onto its child control
 * automatically: `aria-invalid` and `aria-describedby={`${htmlFor}-error`}` (merging
 * with any `aria-describedby` the control already had). This only happens when
 * `children` is a single React element — pass a single control as the child.
 */
function Field({ label, htmlFor, helper, error, optional, className, children }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  const control =
    error && React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          "aria-invalid": true,
          "aria-describedby":
            [
              (children as React.ReactElement<Record<string, unknown>>).props["aria-describedby"],
              errorId,
            ]
              .filter(Boolean)
              .join(" ") || undefined,
        })
      : children;

  return (
    <div className={cn("space-y-1.5", className)} data-slot="field">
      <label htmlFor={htmlFor} className="flex items-center justify-between text-sm font-semibold">
        <span>{label}</span>
        {optional && <span className="font-normal text-muted-foreground">Optional</span>}
      </label>
      {control}
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
