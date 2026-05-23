"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvent, useUpdateEvent } from "@/lib/events";

type Props = { orgSlug: string; eventSlug: string };

export function WalkinSettingsCard({ orgSlug, eventSlug }: Props) {
  const event = useEvent(orgSlug, eventSlug);
  const update = useUpdateEvent(orgSlug, eventSlug);
  // Draft pattern: `null` means "show whatever the server says"; a string
  // means "user is editing". Avoids the useEffect→setState anti-pattern that
  // the React 19 lint rule (`react-hooks/set-state-in-effect`) rejects, and
  // keeps in-flight edits from being blown away if the query refetches.
  const [capacityDraft, setCapacityDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const serverValue = event.data ? String(event.data.walkin_capacity) : "";
  const capacity = capacityDraft ?? serverValue;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const cap = capacity.trim() === "" ? 0 : Number(capacity);
    if (!Number.isInteger(cap) || cap < 0) {
      setError("Walk-in capacity must be a non-negative whole number.");
      return;
    }
    try {
      const updated = await update.mutateAsync({ walkin_capacity: cap });
      // Drop the draft so the input mirrors the (now refetched) server value.
      setCapacityDraft(null);
      setSuccess(
        updated.walkin_capacity === 0
          ? "Saved. Walk-ins are unlimited."
          : `Saved. Cap set to ${updated.walkin_capacity}.`,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Walk-in capacity</CardTitle>
        <CardDescription>
          Hard cap on total walk-in guests (counting all non-voided). <code>0</code> means
          unlimited. Enforced server-side under an event-wide advisory lock, so concurrent claims
          cannot breach the cap.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4 max-w-sm">
          <label className="block">
            <span className="text-sm font-medium">Capacity</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={capacity}
              onChange={(e) => setCapacityDraft(e.target.value)}
              disabled={event.isLoading}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              placeholder="0"
            />
          </label>
          <Button type="submit" disabled={update.isPending || event.isLoading}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
