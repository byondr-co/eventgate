"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
import { useAddField, useDeleteField, useFields, type FieldType } from "@/lib/events";

export function RegistrationFormBuilder({
  orgSlug,
  eventSlug,
}: {
  orgSlug: string;
  eventSlug: string;
}) {
  const fields = useFields(orgSlug, eventSlug);
  const addField = useAddField(orgSlug, eventSlug);
  const deleteField = useDeleteField(orgSlug, eventSlug);
  const [name, setName] = useState("");
  const [labelKm, setLabelKm] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [required, setRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const field_key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const nextOrder = (fields.data?.results.length ?? 0) + 1;
    try {
      await addField.mutateAsync({
        field_key,
        label_en: name,
        label_km: labelKm,
        field_type: type,
        required,
        order_index: nextOrder,
      });
      setName("");
      setLabelKm("");
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a field</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto_auto]">
            <input
              required
              placeholder="Label (English)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Label (Khmer)"
              value={labelKm}
              onChange={(e) => setLabelKm(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="text">Text</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="textarea">Long text</option>
              <option value="select">Select</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
              Required
            </label>
            <Button type="submit" disabled={addField.isPending}>
              Add
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fields</CardTitle>
        </CardHeader>
        <CardContent>
          {fields.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {fields.data && (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Key</th>
                  <th className="text-left font-normal py-2">Label (EN)</th>
                  <th className="text-left font-normal py-2">Label (KM)</th>
                  <th className="text-left font-normal py-2">Type</th>
                  <th className="text-left font-normal py-2">Required</th>
                  <th className="text-left font-normal py-2"></th>
                </tr>
              </thead>
              <tbody>
                {fields.data.results.map((f) => (
                  <tr key={f.id} className="border-b">
                    <td className="py-2 font-mono text-xs">{f.field_key}</td>
                    <td className="py-2">{f.label_en}</td>
                    <td className="py-2">{f.label_km}</td>
                    <td className="py-2">{f.field_type}</td>
                    <td className="py-2">{f.required ? "Yes" : "No"}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deleteField.isPending}
                        onClick={() => {
                          if (f.is_preset) {
                            const labels: Record<string, string> = {
                              email:
                                "Deleting `email` will disable QR-code email delivery for this event's new registrations.",
                              name: "Deleting `name` will remove the guest-name capture; reports will lose name attribution.",
                              phone_or_chat:
                                "Deleting `phone_or_chat` will remove walk-in lookup by phone/chat ID.",
                            };
                            const warning =
                              labels[f.field_key] ??
                              "This is a preset field; deleting it may break flows that rely on it.";
                            if (
                              !window.confirm(
                                `${warning}\n\nThis cannot be undone via the UI. Continue?`,
                              )
                            ) {
                              return;
                            }
                          }
                          deleteField.mutate(f.field_key);
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
