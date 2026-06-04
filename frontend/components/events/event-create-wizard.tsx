"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCreateEvent } from "@/lib/events";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function EventCreateWizard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const create = useCreateEvent(orgSlug);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [venue, setVenue] = useState("");
  // 0 = unlimited (matches backend default + `walkins_enabled` toggle being
  // independent). Store as string so the input can be empty mid-edit; coerce
  // on submit.
  const [walkinCapacity, setWalkinCapacity] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === slugify(name)) setSlug(slugify(v));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cap = walkinCapacity.trim() === "" ? 0 : Number(walkinCapacity);
    if (!Number.isInteger(cap) || cap < 0) {
      setError("Walk-in capacity must be a non-negative whole number.");
      return;
    }
    try {
      const event = await create.mutateAsync({ name, slug, venue, walkin_capacity: cap });
      router.push(`/orgs/${orgSlug}/events/${event.slug}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create event</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Event name" htmlFor="event-name">
            <Input
              id="event-name"
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={`byondr.co Conference ${new Date().getFullYear()}`}
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
                Hard cap on total walk-in guests. <code>0</code> means unlimited. Editable later in
                event settings.
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
          <Button type="submit" className="w-full" disabled={create.isPending || !name || !slug}>
            {create.isPending ? "Creating…" : "Create event"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
