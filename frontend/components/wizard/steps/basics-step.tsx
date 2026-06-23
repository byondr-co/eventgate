"use client";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StepNav } from "@/components/wizard/step-nav";
import { useCreateEvent } from "@/lib/events";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function BasicsStep({
  orgSlug,
  onCreated,
}: {
  orgSlug: string;
  onCreated: (slug: string, name: string) => void;
}) {
  const create = useCreateEvent(orgSlug);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [venue, setVenue] = useState("");
  const [walkinCapacity, setWalkinCapacity] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === slugify(name)) setSlug(slugify(v));
  };

  const submit = async () => {
    setError(null);
    const cap = walkinCapacity.trim() === "" ? 0 : Number(walkinCapacity);
    if (!Number.isInteger(cap) || cap < 0) {
      setError("Walk-in capacity must be a non-negative whole number.");
      return;
    }
    try {
      const event = await create.mutateAsync({
        name,
        slug,
        venue,
        walkin_capacity: cap,
      });
      onCreated(event.slug, event.name ?? name);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Event name" htmlFor="event-name">
        <Input
          id="event-name"
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </Field>
      <Field
        label="URL slug"
        htmlFor="event-slug"
        helper={
          <>
            Public form: /e/{orgSlug}/{slug || "your-slug"}/register
          </>
        }
      >
        <Input
          id="event-slug"
          required
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          className="font-mono"
        />
      </Field>
      <Field label="Venue" htmlFor="event-venue" optional>
        <Input id="event-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
      </Field>
      <Field
        label="Walk-in capacity"
        htmlFor="event-walkin-capacity"
        helper={
          <>
            <code>0</code> means unlimited. Editable later in event settings.
          </>
        }
      >
        <Input
          id="event-walkin-capacity"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={walkinCapacity}
          onChange={(e) => setWalkinCapacity(e.target.value)}
          className="font-mono"
          placeholder="0"
        />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <StepNav
        onNext={submit}
        nextLabel={create.isPending ? "Creating…" : "Next"}
        nextDisabled={create.isPending || !name || !slug}
      />
    </div>
  );
}
