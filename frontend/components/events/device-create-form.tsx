"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { extractFieldErrors } from "@/lib/api";
import { useCreateDevice, type DeviceRole } from "@/lib/devices";

type Props = { orgSlug: string; eventSlug: string };

type RoleOption = { value: DeviceRole; label: string };
const ROLES: RoleOption[] = [
  { value: "scanner", label: "Pre-reg scanner" },
  { value: "walkin_display", label: "Walk-in display" },
  { value: "helpdesk", label: "Help desk (reserved)" },
];

export function DeviceCreateForm({ orgSlug, eventSlug }: Props) {
  const create = useCreateDevice(orgSlug, eventSlug);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<DeviceRole>("scanner");
  const [gate, setGate] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setCode(null);
    try {
      const r = await create.mutateAsync({ label, role, gate: gate || undefined });
      setCode(r.enrollment_code);
      setLabel("");
      setGate("");
    } catch (err) {
      const { fieldErrors: fe, formError: fe2 } = extractFieldErrors(err);
      setFieldErrors(fe);
      setFormError(fe2);
    }
  };

  const onCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enroll a new device</CardTitle>
        <CardDescription>
          Each device gets a one-time enrollment code. Paste it into the scanner PWA on the device
          itself to exchange it for a durable token.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <Field
            label="Label"
            htmlFor="device-label"
            error={fieldErrors.label}
            helper="Shown on the device and in the audit log."
          >
            <Input
              id="device-label"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Gate 1 Lane A"
            />
          </Field>

          <Field label="Role" htmlFor="device-role">
            <Select
              id="device-role"
              value={role}
              onChange={(e) => setRole(e.target.value as DeviceRole)}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Gate" htmlFor="device-gate" optional>
            <Input
              id="device-gate"
              value={gate}
              onChange={(e) => setGate(e.target.value)}
              placeholder="e.g. Gate 1"
            />
          </Field>

          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create device"}
          </Button>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
        </form>

        {code && (
          <div className="mt-6 rounded-lg border bg-muted/40 p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Enrollment code · shown once
            </p>
            <p className="mt-2 font-mono text-sm break-all text-foreground">{code}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onCopy}>
              {copied ? "Copied!" : "Copy code"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Paste this on the device at <span className="font-mono">/scanner/enroll</span>. If you
              lose it, revoke the device and create a new one.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
