"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFields } from "@/lib/events";
import { googleFormBridgeAppsScript } from "@/lib/google-form-bridge-apps-script";
import {
  type BridgeInput,
  useCreateGoogleFormBridge,
  useGoogleFormBridges,
  useRotateGoogleFormBridgeSecret,
  useUpdateGoogleFormBridge,
} from "@/lib/google-form-bridge";

type Props = { orgSlug: string; eventSlug: string };

function OneTimeSecretBlock({ secret }: { secret: string }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <p className="font-semibold text-foreground">Copy this secret now. It is shown once.</p>
      <p className="mt-1 break-all font-mono text-xs text-foreground">{secret}</p>
    </div>
  );
}

export function GoogleFormBridgeCard({ orgSlug, eventSlug }: Props) {
  const bridges = useGoogleFormBridges(orgSlug, eventSlug);
  const fields = useFields(orgSlug, eventSlug);
  const create = useCreateGoogleFormBridge(orgSlug, eventSlug);
  const bridge = bridges.data?.results[0] ?? null;
  const update = useUpdateGoogleFormBridge(orgSlug, eventSlug, bridge?.id ?? "");
  const rotate = useRotateGoogleFormBridgeSecret(orgSlug, eventSlug, bridge?.id ?? "");
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [mappingLabel, setMappingLabel] = useState("");
  const [mappingTarget, setMappingTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fieldsReady = Boolean(fields.data);
  const fieldOptions = fields.data?.results ?? [];
  const fieldMapping = bridge?.field_mapping ?? {};
  const mappingEntries = Object.entries(fieldMapping);
  const mappedFieldKeys = new Set(Object.values(fieldMapping));
  const missingRequiredFields = fieldOptions.filter(
    (field) => field.required && !mappedFieldKeys.has(field.field_key),
  );
  const requiredMappingsMissing = fieldsReady && missingRequiredFields.length > 0;
  const enableBlocked = !!bridge && !bridge.enabled && (!fieldsReady || requiredMappingsMissing);
  const script = useMemo(
    () => googleFormBridgeAppsScript(bridge?.webhook_url ?? ""),
    [bridge?.webhook_url],
  );
  const trimmedMappingLabel = mappingLabel.trim();
  const canSaveMapping =
    !!bridge && trimmedMappingLabel.length > 0 && mappingTarget.length > 0 && !update.isPending;

  const clearFeedback = () => {
    setError(null);
    setSuccess(null);
  };

  const messageFromError = (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong.";

  const onCreate = async () => {
    clearFeedback();
    try {
      const created = await create.mutateAsync({
        name: "Google Form",
        enabled: false,
        duplicate_policy: "upsert_by_email",
        field_mapping: {},
      });
      setOneTimeSecret(created.secret);
      setSuccess("Bridge created. Copy the one-time secret before leaving this page.");
    } catch (err) {
      setError(messageFromError(err));
    }
  };

  const onRotate = async () => {
    if (!bridge) return;
    clearFeedback();
    try {
      const rotated = await rotate.mutateAsync();
      setOneTimeSecret(rotated.secret);
      setSuccess("Secret rotated. Copy the new one-time secret before leaving this page.");
    } catch (err) {
      setError(messageFromError(err));
    }
  };

  const patchBridge = async (input: BridgeInput, successMessage: string) => {
    if (!bridge) return false;
    clearFeedback();
    try {
      await update.mutateAsync(input);
      setSuccess(successMessage);
      return true;
    } catch (err) {
      setError(messageFromError(err));
      return false;
    }
  };

  const onEnabledChange = async (checked: boolean) => {
    if (checked && (!fieldsReady || requiredMappingsMissing)) {
      return;
    }
    await patchBridge({ enabled: checked }, checked ? "Bridge enabled." : "Bridge disabled.");
  };

  const onSaveDraftMapping = async () => {
    if (!canSaveMapping) return;
    const saved = await patchBridge(
      {
        field_mapping: {
          ...fieldMapping,
          [trimmedMappingLabel]: mappingTarget,
        },
      },
      "Mapping saved.",
    );
    if (!saved) return;
    setMappingLabel("");
    setMappingTarget("");
  };

  const onRemoveMapping = async (googleLabel: string) => {
    const nextMapping = { ...fieldMapping };
    delete nextMapping[googleLabel];
    await patchBridge({ field_mapping: nextMapping }, "Mapping removed.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Form bridge</CardTitle>
        <CardDescription>
          Optional pilot bridge for syncing Google Form responses into this Eventgate guest list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {bridges.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading bridge settings…</p>
        ) : !bridge ? (
          <div className="max-w-2xl space-y-3">
            <p className="text-sm text-muted-foreground">
              Create a bridge, map Google Form labels to Eventgate fields, then install the Apps
              Script trigger in the response Sheet.
            </p>
            <Button type="button" onClick={onCreate} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create bridge"}
            </Button>
          </div>
        ) : (
          <div className="max-w-3xl space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={bridge.enabled}
                disabled={update.isPending || enableBlocked}
                onChange={(e) => void onEnabledChange(e.currentTarget.checked)}
                className="size-4 rounded accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              Enabled
            </label>

            {!fieldsReady && !bridge.enabled && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                Event fields are loading. Enabling will be available after required fields are
                known.
              </div>
            )}

            {requiredMappingsMissing && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                Map required fields before enabling:{" "}
                {missingRequiredFields.map((field) => field.label_en).join(", ")}.
              </div>
            )}

            <Field label="Webhook URL" htmlFor="google-bridge-webhook">
              <Input
                id="google-bridge-webhook"
                readOnly
                value={bridge.webhook_url}
                className="font-mono text-xs"
              />
            </Field>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Field mapping</p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
                <Field label="Google Form label" htmlFor="google-bridge-mapping-label">
                  <Input
                    id="google-bridge-mapping-label"
                    value={mappingLabel}
                    onChange={(e) => setMappingLabel(e.currentTarget.value)}
                    placeholder="Full Name"
                  />
                </Field>
                <Field label="Eventgate field" htmlFor="google-bridge-mapping-target">
                  <Select
                    id="google-bridge-mapping-target"
                    value={mappingTarget}
                    onChange={(e) => setMappingTarget(e.currentTarget.value)}
                  >
                    <option value="">Select field</option>
                    {fieldOptions.map((field) => (
                      <option key={field.field_key} value={field.field_key}>
                        {field.label_en}
                        {field.required ? " *" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onSaveDraftMapping}
                  disabled={!canSaveMapping}
                  className="self-end"
                >
                  Add/update mapping
                </Button>
              </div>
              {mappingEntries.length > 0 ? (
                <div className="space-y-2">
                  {mappingEntries.map(([googleLabel, target]) => (
                    <div
                      key={googleLabel}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]"
                    >
                      <Input
                        readOnly
                        value={googleLabel}
                        aria-label={`Google label: ${googleLabel}`}
                      />
                      <Select
                        value={target}
                        aria-label={`Eventgate field for ${googleLabel}`}
                        onChange={(e) =>
                          void patchBridge(
                            {
                              field_mapping: {
                                ...fieldMapping,
                                [googleLabel]: e.currentTarget.value,
                              },
                            },
                            "Mapping saved.",
                          )
                        }
                      >
                        {fieldOptions.map((field) => (
                          <option key={field.field_key} value={field.field_key}>
                            {field.label_en}
                            {field.required ? " *" : ""}
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void onRemoveMapping(googleLabel)}
                        disabled={update.isPending}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No labels mapped yet. Add labels after the first rehearsal response or configure
                  them through the API while preparing the pilot.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRotate}
                disabled={rotate.isPending}
              >
                {rotate.isPending ? "Rotating…" : "Rotate secret"}
              </Button>
            </div>

            <Field label="Apps Script" htmlFor="google-bridge-script">
              <Textarea
                id="google-bridge-script"
                readOnly
                rows={18}
                value={script}
                className="font-mono text-xs leading-relaxed"
              />
            </Field>
          </div>
        )}

        {oneTimeSecret && <OneTimeSecretBlock secret={oneTimeSecret} />}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {success && <p className="text-sm text-success">{success}</p>}
      </CardContent>
    </Card>
  );
}
