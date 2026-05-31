"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicEventField } from "@/lib/events";
import { useRegisterPublic } from "@/lib/guests";

const PRESET_KEYS = new Set(["name", "email", "phone_or_chat"]);

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
  const register = useRegisterPublic(orgSlug, eventSlug);
  const [form, setForm] = useState<Record<string, string>>({
    name: "",
    email: "",
    phone_or_chat: "",
  });
  const [error, setError] = useState<string | null>(null);

  // Custom (non-preset) fields, sorted by order_index — appended after the
  // preset name/email/phone block.
  const customFields = (fields ?? [])
    .filter((f) => !PRESET_KEYS.has(f.field_key))
    .sort((a, b) => a.order_index - b.order_index);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { guest_id, entry_token } = await register.mutateAsync(form);
      router.push(
        `/e/${orgSlug}/${eventSlug}/registered/${guest_id}?token=${encodeURIComponent(entry_token)}`,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const label = (f: PublicEventField) => (locale === "km" && f.label_km ? f.label_km : f.label_en);

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
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">{t("field_name")}</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("field_email")}</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("field_phone")}</span>
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
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  rows={3}
                />
              ) : f.field_type === "select" ? (
                <select
                  required={f.required}
                  value={form[f.field_key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.field_key]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    {t("selectPlaceholder")}
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

          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? t("submitting") : t("submit")}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
