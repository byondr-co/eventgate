import * as React from "react";

import { cn } from "@/lib/utils";

// Chevron is a static data-URI background, so its color can't inherit currentColor.
// Use a mid-grey caret in light mode and a lighter one in dark mode for adequate contrast.
// SVG data URIs use %27 for single-quotes (no outer quotes) to avoid Turbopack CSS parser issues.
const chevron =
  "bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat bg-[url(data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%2724%27%20height%3D%2724%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%23737373%27%20stroke-width%3D%271.6%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27m7%209%205-5%205%205M7%2015l5%205%205-5%27%2F%3E%3C%2Fsvg%3E)] dark:bg-[url(data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%2724%27%20height%3D%2724%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%23a3a3a3%27%20stroke-width%3D%271.6%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27m7%209%205-5%205%205M7%2015l5%205%205-5%27%2F%3E%3C%2Fsvg%3E)]";

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-9 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-9 pl-3 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        chevron,
        className,
      )}
      {...props}
    />
  );
}

export { Select };
