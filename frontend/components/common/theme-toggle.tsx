"use client";

import { useTheme } from "next-themes";
import { SunIcon, MoonIcon, MonitorIcon } from "lucide-react";

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
    // Avoid SSR/client mismatch: reserve space until the resolved theme is known.
    return (
      <div className={className} style={{ height: "2rem", width: "13rem" }} aria-hidden="true" />
    );
  }

  return (
    <SegmentedControl
      aria-label="Color theme"
      className={className}
      options={OPTIONS}
      value={(theme as ThemeValue) ?? "system"}
      onValueChange={(next) => setTheme(next)}
    />
  );
}
