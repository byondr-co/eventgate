"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicEventField } from "@/lib/events";
import { useCompleteInfo } from "@/lib/walkins";

const PRESET_KEYS = new Set(["name", "email", "phone_or_chat"]);

type Props = {
  orgSlug: string;
  eventSlug: string;
  token: string;
  eventName: string;
  fields: PublicEventField[];
};

/** Inside-hall info form for walk-in guests. Mirrors RegistrationForm's
 *  rendering (presets + dynamic custom fields) but submits to the walk-in
 *  info endpoint. First write wins server-side. */
export function WalkinInfoForm({ orgSlug, eventSlug, token, eventName, fields }: Props) {
  const locale = useLocale();
  const complete = useCompleteInfo(orgSlug, eventSlug, token);
  const [form, setForm] = useState<Record<string, string>>({
    name: "",
    email: "",
    phone_or_chat: "",
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customFields = fields
    .filter((f) => !PRESET_KEYS.has(f.field_key))
    .sort((a, b) => a.order_index - b.order_index);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await complete.mutateAsync(form);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const label = (f: PublicEventField) => (locale === "km" && f.label_km ? f.label_km : f.label_en);

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Thanks! Your info is saved.</CardTitle>
          <CardDescription>Enjoy {eventName}.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{eventName}</CardTitle>
        <CardDescription>Please complete your info — it only takes a moment.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Full name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Phone or Chat ID</span>
            <input
              required
              value={form.phone_or_chat}
              onChange={(e) => setForm({ ...form, phone_or_chat: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>

          {customFields.map((f) => (
            <label key={f.field_key} className="block">
              <span className="text-sm font-medium">
                {label(f)}
                {f.required ? <span className="text-destructive"> *</span> : null}
              </span>
              {f.field_type === "textarea" ? (
                <textarea
                  required={f.required}
                  value={form[f.field_key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              ) : f.field_type === "select" ? (
                <select
                  required={f.required}
                  value={form[f.field_key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Choose an option…
                  </option>
                  {(f.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required={f.required}
                  type={f.field_type === "email" ? "email" : "text"}
                  value={form[f.field_key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              )}
            </label>
          ))}

          <Button type="submit" className="w-full" disabled={complete.isPending}>
            {complete.isPending ? "Saving…" : "Save my info"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
