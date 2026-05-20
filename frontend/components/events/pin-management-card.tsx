"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSetPin } from "@/lib/devices";

type Props = { orgSlug: string; eventSlug: string };

export function PinManagementCard({ orgSlug, eventSlug }: Props) {
  const setPin = useSetPin(orgSlug, eventSlug);
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (pin.length < 4) {
      setError("PIN must be at least 4 characters.");
      return;
    }
    if (pin !== confirm) {
      setError("PINs do not match.");
      return;
    }
    try {
      const r = await setPin.mutateAsync(pin);
      setSuccess(`PIN updated at ${new Date(r.rotated_at).toLocaleString()}.`);
      setPinValue("");
      setConfirm("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event PIN</CardTitle>
        <CardDescription>
          Staff devices enter this PIN at the door to unlock their scanner / display. Share it at
          the staff briefing; rotate it after each event.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4 max-w-sm">
          <label className="block">
            <span className="text-sm font-medium">New PIN</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPinValue(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono tracking-widest"
              placeholder="At least 4 characters"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Confirm PIN</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono tracking-widest"
            />
          </label>
          <Button type="submit" disabled={setPin.isPending}>
            {setPin.isPending ? "Saving…" : "Set / rotate PIN"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
