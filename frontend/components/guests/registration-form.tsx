"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { extractFieldErrors } from "@/lib/api";
import type { PublicEventField } from "@/lib/events";
import { useRegisterPublic } from "@/lib/guests";

type Props = {
  orgSlug: string;
  eventSlug: string;
  eventName: string;
  venue?: string;
  fields?: PublicEventField[];
  bannerImage?: string | null;
  description?: string;
};

export function RegistrationForm({
  orgSlug,
  eventSlug,
  eventName,
  venue,
  fields,
  bannerImage,
  description,
}: Props) {
  const t = useTranslations("register");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  const register = useRegisterPublic(orgSlug, eventSlug);

  // All fields sorted by order_index — driven entirely from props.
  const sortedFields = (fields ?? []).slice().sort((a, b) => a.order_index - b.order_index);

  // Initialise form state from the field list.
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(sortedFields.map((f) => [f.field_key, ""])),
  );

  // Inline errors: one per field_key + an optional form-level message.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const label = (f: PublicEventField) => (locale === "km" && f.label_km ? f.label_km : f.label_en);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side required validation.
    const newFieldErrors: Record<string, string> = {};
    for (const f of sortedFields) {
      if (f.required && !(form[f.field_key] ?? "").trim()) {
        newFieldErrors[f.field_key] = t("fieldRequired");
      }
    }
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }
    setFieldErrors({});

    try {
      const { guest_id, entry_token } = await register.mutateAsync({
        ...form,
        ...(ref ? { ref } : {}),
      });
      router.push(
        `/e/${orgSlug}/${eventSlug}/registered/${guest_id}?token=${encodeURIComponent(entry_token)}`,
      );
    } catch (err) {
      const { fieldErrors: fe, formError: fe2 } = extractFieldErrors(err);
      setFieldErrors(fe);
      setFormError(fe2);
    }
  };

  return (
    <Card className="overflow-hidden">
      {bannerImage ? <img src={bannerImage} alt="" className="h-40 w-full object-cover" /> : null}
      <CardHeader>
        <CardTitle>{t("title", { eventName })}</CardTitle>
        <CardDescription>
          {description ? description : venue ? venue : t("subtitle")}
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
                      {t("selectPlaceholder")}
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

          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
