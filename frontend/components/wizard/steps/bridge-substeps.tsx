"use client";

import { useState } from "react";

import { IllustrationGoogleInstall } from "@/components/illustrations";
import { SuccessBurst } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { StepNav } from "@/components/wizard/step-nav";

export function BridgeIntro({
  onStart,
  onBack,
  pending,
}: {
  onStart: () => void;
  onBack: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-4">
      <IllustrationGoogleInstall className="mx-auto h-24 w-24" />
      <h2 className="text-center text-lg font-medium">Connect your Google Form</h2>
      <p className="text-center text-sm text-muted-foreground">
        We&apos;ll detect your form&apos;s questions, you&apos;ll paste a short snippet into your
        Sheet, then send one test response to confirm it works.
      </p>
      <StepNav
        onBack={onBack}
        onNext={onStart}
        nextLabel={pending ? "Preparing…" : "Start"}
        nextDisabled={pending}
      />
    </div>
  );
}

export function BridgeInstall({
  snippet,
  onCopy,
  onNext,
  onBack,
}: {
  snippet: string;
  onCopy: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    onCopy();
    setCopied(true);
  };
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Open your Form&apos;s response Sheet → Extensions → Apps Script.</li>
        <li>Paste the snippet below and run Eventgate → Initialize setup.</li>
        <li>Come back here and send one test response.</li>
      </ol>
      <Button type="button" onClick={copy}>
        {copied ? "Copied ✓" : "Copy snippet"}
      </Button>
      <details className="rounded-md border p-2">
        <summary className="cursor-pointer text-sm text-muted-foreground">Show snippet</summary>
        <pre className="mt-2 max-h-64 overflow-auto text-xs">
          <code>{snippet}</code>
        </pre>
      </details>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

export function BridgeTest({
  state,
  mapped,
  onRetry,
  onBack,
  onNext,
}: {
  state: "waiting" | "accepted" | "rejected";
  mapped: Record<string, string>;
  onRetry: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      {state === "waiting" && (
        <p className="text-sm text-muted-foreground">Waiting for your test response…</p>
      )}
      {state === "accepted" && (
        <>
          <SuccessBurst label="Test response received" />
          <dl className="mx-auto max-w-xs text-left text-sm">
            {Object.entries(mapped).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {state === "rejected" && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            That response couldn&apos;t be parsed. Check the snippet saved and the trigger
            installed, then try again.
          </p>
          <Button type="button" variant="ghost" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel="Finish"
        nextDisabled={state !== "accepted"}
      />
    </div>
  );
}
