"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { StepNav } from "@/components/wizard/step-nav";
import {
  type DetectedFields,
  useCreateGoogleFormBridge,
  useDetectedFields,
  useTestSubmission,
  useUpdateGoogleFormBridge,
} from "@/lib/google-form-bridge";
import { googleFormBridgeAppsScript } from "@/lib/google-form-bridge-apps-script";

import { BridgeInstall, BridgeIntro, BridgeTest } from "./bridge-substeps";

type Sub = "intro" | "install" | "map" | "test";

const PRESET_TARGETS = ["email", "name", "phone_or_chat"];

function MappingSubStep({
  detected,
  onSave,
  onBack,
}: {
  detected: DetectedFields | undefined;
  onSave: (mapping: Record<string, string>) => void;
  onBack: () => void;
}) {
  const labels = detected?.seen_labels ?? [];
  const suggestions = detected?.suggestions;
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Seed the mapping from server suggestions the first time they arrive (the
  // detected-fields query resolves asynchronously while this step polls), without
  // clobbering any selection the organizer has already made.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current && suggestions && Object.keys(suggestions).length > 0) {
      setMapping(suggestions);
      seeded.current = true;
    }
  }, [suggestions]);

  // Targets = presets plus any server-suggested or currently-selected field keys
  // (which may be custom event fields), so a pre-filled suggestion always has a
  // matching <option> and is never silently dropped on save.
  const targets = Array.from(
    new Set([...PRESET_TARGETS, ...Object.values(suggestions ?? {}), ...Object.values(mapping)]),
  ).filter(Boolean);

  if (labels.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Submit one response from your Google Form so we can detect its questions. This screen
          updates automatically when it arrives…
        </p>
        <StepNav onBack={onBack} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {labels.map((label) => (
        <Field key={label} label={label} htmlFor={`map-${label}`}>
          <Select
            id={`map-${label}`}
            value={mapping[label] ?? ""}
            onChange={(e) => setMapping((m) => ({ ...m, [label]: e.target.value }))}
          >
            <option value="">— ignore —</option>
            {targets.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      ))}
      <StepNav
        onBack={onBack}
        onNext={() => onSave(Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)))}
        nextLabel="Save & test"
      />
    </div>
  );
}

export function BridgeStep({
  orgSlug,
  eventSlug,
  onDone,
  onBack,
}: {
  orgSlug: string;
  eventSlug: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const [sub, setSub] = useState<Sub>("intro");
  const [bridgeId, setBridgeId] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const create = useCreateGoogleFormBridge(orgSlug, eventSlug);
  const update = useUpdateGoogleFormBridge(orgSlug, eventSlug, bridgeId);
  const detected = useDetectedFields(orgSlug, eventSlug, bridgeId, {
    poll: sub === "map",
  });
  const test = useTestSubmission(orgSlug, eventSlug, bridgeId, {
    poll: sub === "test",
  });

  const snippet = useMemo(
    () => (webhookUrl ? googleFormBridgeAppsScript(webhookUrl, secret) : ""),
    [webhookUrl, secret],
  );
  // The poll endpoint recomputes `mapped` against the bridge's CURRENT field
  // mapping, so once mapping is saved a green result means the latest response
  // maps to a registrable guest (email present). No second submission needed.
  const testState: "waiting" | "accepted" | "rejected" = !test.data
    ? "waiting"
    : test.data.mapped?.email
      ? "accepted"
      : "rejected";

  const start = async () => {
    const b = await create.mutateAsync({ test_mode: true, enabled: false });
    setBridgeId(b.id);
    setWebhookUrl(b.webhook_url);
    setSecret(b.secret);
    setSub("install");
  };
  const finish = async () => {
    await update.mutateAsync({ test_mode: false, enabled: true });
    onDone();
  };

  if (sub === "intro") {
    return <BridgeIntro onStart={start} onBack={onBack} pending={create.isPending} />;
  }
  if (sub === "install") {
    return (
      <BridgeInstall
        snippet={snippet}
        onCopy={() => {}}
        onBack={() => setSub("intro")}
        onNext={() => setSub("map")}
      />
    );
  }
  if (sub === "map") {
    return (
      <MappingSubStep
        detected={detected.data}
        onBack={() => setSub("install")}
        onSave={async (mapping) => {
          await update.mutateAsync({ field_mapping: mapping });
          setSub("test");
        }}
      />
    );
  }
  return (
    <BridgeTest
      state={testState}
      mapped={test.data?.mapped ?? {}}
      onRetry={() => test.refetch()}
      onBack={() => setSub("map")}
      onNext={finish}
    />
  );
}
