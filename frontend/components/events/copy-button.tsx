"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type Props = { text: string; label?: string };

export function CopyButton({ text, label = "Copy" }: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Copied to clipboard");
        } catch {
          toast.error("Copy failed — your browser may block clipboard access");
        }
      }}
    >
      {label}
    </Button>
  );
}
