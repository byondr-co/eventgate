"use client";
import type { ReactNode } from "react";
import { Tappable } from "@/components/motion";
import { cn } from "@/lib/utils";

export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <Tappable>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={cn(
          "w-full rounded-xl border p-5 text-left transition-colors",
          selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
        )}
      >
        {icon && <div className="mb-3 h-16 w-16 text-primary">{icon}</div>}
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </button>
    </Tappable>
  );
}
