"use client";

import { useInstallPrompt } from "@/lib/scanner/install";

export function InstallButton() {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button
      type="button"
      onClick={() => void install()}
      className="rounded-md border border-neutral-700 px-2 py-0.5 font-mono text-xs hover:bg-neutral-800"
    >
      Install
    </button>
  );
}
