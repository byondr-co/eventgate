"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { type ManualReviewGuest, resolveManualReview } from "@/lib/helpdesk";

type Props = {
  guest: ManualReviewGuest;
  orgSlug: string;
  eventSlug: string;
  onChanged: () => void;
};

export function ManualReviewDetail({ guest, orgSlug, eventSlug, onChanged }: Props) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = (action: "approve_checkin" | "void") => async () => {
    setBusy(true);
    try {
      await resolveManualReview(orgSlug, eventSlug, guest.id, { action, notes });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Manual review · {guest.full_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <div>
            <span className="text-muted-foreground">Email: </span>
            {guest.email || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Phone: </span>
            {guest.phone_or_chat || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Type: </span>
            {guest.guest_type}
          </div>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Resolution notes (optional)"
          rows={3}
        />
        <div className="flex gap-2">
          <Button onClick={resolve("approve_checkin")} disabled={busy} variant="default">
            Approve check-in
          </Button>
          <Button onClick={resolve("void")} disabled={busy} variant="destructive">
            Mark void
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
