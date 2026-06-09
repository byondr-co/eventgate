"use client";

import { useTheme } from "next-themes";
import { SunIcon, MoonIcon, MonitorIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";

type ThemeValue = "light" | "dark" | "system";

const OPTIONS: { value: ThemeValue; label: React.ReactNode }[] = [
  {
    value: "light",
    label: (
      <span className="flex items-center gap-0 sm:gap-1.5">
        <SunIcon className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Light</span>
      </span>
    ),
  },
  {
    value: "dark",
    label: (
      <span className="flex items-center gap-0 sm:gap-1.5">
        <MoonIcon className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Dark</span>
      </span>
    ),
  },
  {
    value: "system",
    label: (
      <span className="flex items-center gap-0 sm:gap-1.5">
        <MonitorIcon className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">System</span>
      </span>
    ),
  },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  if (resolvedTheme === undefined) {
    // Reserve space until next-themes resolves on the client. Width matches the compact
    // (icon-only) control below sm: and the full control at sm:+, avoiding a hydration jump.
    return <div className={cn("h-8 w-[7.5rem] sm:w-[13rem]", className)} aria-hidden="true" />;
  }

  return (
    <SegmentedControl
      aria-label="Color theme"
      className={className}
      options={OPTIONS}
      // Reflect the user's preference (`theme`, which may be "system"), not `resolvedTheme`
      // (only light/dark) — so "System" stays selected when the OS prefers dark.
      // The cast is safe: ThemeProvider is configured with exactly these three values.
      value={(theme as ThemeValue) ?? "system"}
      onValueChange={(next) => setTheme(next)}
    />
  );
}
