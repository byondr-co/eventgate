"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCode(null);
    try {
      const r = await create.mutateAsync({ label, role, gate: gate || undefined });
      setCode(r.enrollment_code);
      setLabel("");
      setGate("");
    } catch (err) {
      setError((err as Error).message);
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
        <form onSubmit={onSubmit} className="space-y-4 max-w-md">
          <label className="block">
            <span className="text-sm font-medium">Label</span>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Gate 1 Lane A"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as DeviceRole)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Gate (optional)</span>
            <input
              value={gate}
              onChange={(e) => setGate(e.target.value)}
              placeholder="e.g. Gate 1"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create device"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        {code && (
          <div className="mt-6 rounded-md border border-amber-500 bg-amber-50 p-4 dark:bg-amber-950">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Enrollment code — shown only once
            </p>
            <p className="mt-2 break-all font-mono text-sm text-amber-900 dark:text-amber-100">
              {code}
            </p>
            <Button type="button" variant="outline" className="mt-3" onClick={onCopy}>
              {copied ? "Copied!" : "Copy to clipboard"}
            </Button>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Paste this on the device at <span className="font-mono">/scanner/enroll</span>. If you
              lose it, revoke the device and create a new one.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
