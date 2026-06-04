"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicEventField } from "@/lib/events";
import { markInfoCompleted } from "@/lib/walkin-device";
import { useCompleteInfo } from "@/lib/walkins";

type Props = {
  orgSlug: string;
  eventSlug: string;
  token: string;
  eventName: string;
  fields: PublicEventField[];
  bannerImage?: string | null;
  description?: string;
};

/** Inside-hall info form for walk-in guests. Renders the event's registration
 *  fields data-driven (same as the public RegistrationForm, incl. banner) but
 *  submits to the walk-in info endpoint. First write wins server-side. */
export function WalkinInfoForm({
  orgSlug,
  eventSlug,
  token,
  eventName,
  fields,
  bannerImage,
  description,
}: Props) {
  const locale = useLocale();
  const complete = useCompleteInfo(orgSlug, eventSlug, token);

  // All fields sorted by order_index — driven entirely from props (no hardcoded presets).
  const sortedFields = (fields ?? []).slice().sort((a, b) => a.order_index - b.order_index);

  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(sortedFields.map((f) => [f.field_key, ""])),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const label = (f: PublicEventField) => (locale === "km" && f.label_km ? f.label_km : f.label_en);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const newFieldErrors: Record<string, string> = {};
    for (const f of sortedFields) {
      if (f.required && !(form[f.field_key] ?? "").trim()) {
        newFieldErrors[f.field_key] = "This field is required.";
      }
    }
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }
    setFieldErrors({});

    try {
      await complete.mutateAsync(form);
      // Clear the "complete your info" reminder shown on a re-scan.
      markInfoCompleted(orgSlug, eventSlug, token);
      setDone(true);
    } catch (err) {
      // useCompleteInfo surfaces the backend `detail` (already clean) or a status line.
      setFormError((err as Error).message);
    }
  };

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
    <Card className="overflow-hidden">
      {bannerImage ? <img src={bannerImage} alt="" className="h-40 w-full object-cover" /> : null}
      <CardHeader>
        <CardTitle>{eventName}</CardTitle>
        <CardDescription>
          {description ? description : "Please complete your info — it only takes a moment."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          {sortedFields.map((f) => {
            const fieldId = `field-${f.field_key}`;
            const value = form[f.field_key] ?? "";
            return (
              <Field
                key={f.field_key}
                label={label(f)}
                htmlFor={fieldId}
                optional={!f.required}
                error={fieldErrors[f.field_key]}
              >
                {f.field_type === "textarea" ? (
                  <Textarea
                    id={fieldId}
                    value={value}
                    onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                    rows={3}
                    aria-required={f.required}
                  />
                ) : f.field_type === "select" ? (
                  <Select
                    id={fieldId}
                    value={value}
                    onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                    aria-required={f.required}
                  >
                    <option value="" disabled>
                      Choose an option…
                    </option>
                    {(f.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={fieldId}
                    type={f.field_type === "email" ? "email" : "text"}
                    value={value}
                    onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                    aria-required={f.required}
                  />
                )}
              </Field>
            );
          })}

          <Button type="submit" className="w-full" disabled={complete.isPending}>
            {complete.isPending ? "Saving…" : "Save my info"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
