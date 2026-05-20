"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [error, setError] = useState<string | null>(null);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === slugify(name)) setSlug(slugify(v));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const event = await create.mutateAsync({ name, slug, venue });
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
          <label className="block">
            <span className="text-sm font-medium">Event name</span>
            <input
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Annual Meetup 2026"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">URL slug</span>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
            <span className="block mt-1 text-xs text-muted-foreground">
              Public form: /e/{orgSlug}/{slug || "your-slug"}/register
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Venue (optional)</span>
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <Button type="submit" className="w-full" disabled={create.isPending || !name || !slug}>
            {create.isPending ? "Creating…" : "Create event"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
