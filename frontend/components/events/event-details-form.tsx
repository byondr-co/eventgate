"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { extractApiError } from "@/lib/api";
import { useEvent, useUpdateEvent, type UpdateEventInput } from "@/lib/events";

// datetime-local <-> ISO helpers. The input is in the browser's local time;
// we round-trip through Date for a pragmatic admin edit (exact tz math is
// out of scope — the event also carries its own `timezone` field).
const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

// Each field is null until the user edits it; then it tracks the override.
// On save we merge overrides back onto the server-fetched event baseline.
type FormOverrides = {
  name: string | null;
  slug: string | null;
  venue: string | null;
  timezone: string | null;
  walkin_capacity: number | null;
  description: string | null;
  starts_at: string | null | undefined;
  ends_at: string | null | undefined;
};

const empty: FormOverrides = {
  name: null,
  slug: null,
  venue: null,
  timezone: null,
  walkin_capacity: null,
  description: null,
  starts_at: undefined,
  ends_at: undefined,
};

export function EventDetailsForm({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const { data: event, isLoading } = useEvent(orgSlug, eventSlug);
  const update = useUpdateEvent(orgSlug, eventSlug);
  const router = useRouter();

  // null = untouched (fall back to server data); a value = user has edited it.
  const [overrides, setOverrides] = useState<FormOverrides>(empty);

  if (isLoading || !event) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  // Resolved form values: override wins, otherwise server baseline.
  const name = overrides.name ?? event.name;
  const slug = overrides.slug ?? event.slug;
  const venue = overrides.venue ?? event.venue ?? "";
  const timezone = overrides.timezone ?? event.timezone;
  const walkinCapacity = overrides.walkin_capacity ?? event.walkin_capacity;
  const description = overrides.description ?? event.description ?? "";
  const startsAt = overrides.starts_at !== undefined ? overrides.starts_at : event.starts_at;
  const endsAt = overrides.ends_at !== undefined ? overrides.ends_at : event.ends_at;

  const set = (patch: Partial<FormOverrides>) => setOverrides((prev) => ({ ...prev, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: UpdateEventInput = {
      name,
      slug,
      venue,
      timezone,
      walkin_capacity: walkinCapacity,
      description,
      starts_at: startsAt,
      ends_at: endsAt,
    };
    try {
      const saved = await update.mutateAsync(payload);
      if (saved.slug !== eventSlug) {
        toast.success("Saved — your links now point here.");
        router.replace(`/orgs/${orgSlug}/events/${saved.slug}/settings/`);
      } else {
        toast.success("Event details saved.");
      }
    } catch (err) {
      toast.error(extractApiError(err));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border p-4">
      <h2 className="font-medium">Event details</h2>
      <Field label="Event name" htmlFor="ed-name">
        <Input id="ed-name" value={name} onChange={(e) => set({ name: e.target.value })} required />
      </Field>
      <Field
        label="URL slug"
        htmlFor="ed-slug"
        helper={
          <>
            Public form: /e/{orgSlug}/{slug || "your-slug"}/register
          </>
        }
      >
        <Input
          id="ed-slug"
          className="font-mono"
          value={slug}
          onChange={(e) => set({ slug: e.target.value })}
          required
        />
      </Field>
      <Field label="Venue" htmlFor="ed-venue" optional>
        <Input id="ed-venue" value={venue} onChange={(e) => set({ venue: e.target.value })} />
      </Field>
      <Field label="Starts at" htmlFor="ed-starts" optional>
        <Input
          id="ed-starts"
          type="datetime-local"
          value={toLocalInput(startsAt ?? null)}
          onChange={(e) => set({ starts_at: toIso(e.target.value) })}
        />
      </Field>
      <Field label="Ends at" htmlFor="ed-ends" optional>
        <Input
          id="ed-ends"
          type="datetime-local"
          value={toLocalInput(endsAt ?? null)}
          onChange={(e) => set({ ends_at: toIso(e.target.value) })}
        />
      </Field>
      <Field label="Timezone" htmlFor="ed-tz">
        <Input id="ed-tz" value={timezone} onChange={(e) => set({ timezone: e.target.value })} />
      </Field>
      <Field
        label="Walk-in capacity"
        htmlFor="ed-cap"
        helper={
          <>
            <code>0</code> means unlimited.
          </>
        }
      >
        <Input
          id="ed-cap"
          type="number"
          min={0}
          className="font-mono"
          value={walkinCapacity}
          onChange={(e) => set({ walkin_capacity: Number(e.target.value) })}
        />
      </Field>
      <Field label="Description" htmlFor="ed-desc" optional>
        <Textarea
          id="ed-desc"
          value={description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
