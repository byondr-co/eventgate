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
      <span className="flex items-center gap-1.5">
        <SunIcon className="size-4" aria-hidden="true" />
        Light
      </span>
    ),
  },
  {
    value: "dark",
    label: (
      <span className="flex items-center gap-1.5">
        <MoonIcon className="size-4" aria-hidden="true" />
        Dark
      </span>
    ),
  },
  {
    value: "system",
    label: (
      <span className="flex items-center gap-1.5">
        <MonitorIcon className="size-4" aria-hidden="true" />
        System
      </span>
    ),
  },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  if (resolvedTheme === undefined) {
    // Avoid SSR/client mismatch: reserve space (matching the live control's height and
    // approximate width) until next-themes has resolved the theme on the client.
    return <div className={cn("h-8 min-w-[13rem]", className)} aria-hidden="true" />;
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
