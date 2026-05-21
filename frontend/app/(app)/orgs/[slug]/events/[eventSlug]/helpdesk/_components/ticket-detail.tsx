"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { type Ticket, claimTicket, releaseTicket, resolveTicket } from "@/lib/helpdesk";

type Props = {
  ticket: Ticket;
  orgSlug: string;
  eventSlug: string;
  onChanged: () => void;
};

export function TicketDetail({ ticket, orgSlug, eventSlug, onChanged }: Props) {
  const [notes, setNotes] = useState(ticket.resolution_notes);
  const [busy, setBusy] = useState(false);

  const wrap = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const claim = wrap(() => claimTicket(orgSlug, eventSlug, ticket.id));
  const release = wrap(() => releaseTicket(orgSlug, eventSlug, ticket.id));
  const resolve = (action: "approve_checkin" | "resolved_with_note" | "void") =>
    wrap(() => resolveTicket(orgSlug, eventSlug, ticket.id, { action, notes }));

  const original = ticket.audit_event.details_json as {
    reason?: string;
    original_payload?: { gate?: string; scanner_label?: string };
    conflict_payload?: { gate?: string; scanner?: string };
    device_label?: string;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{original.reason || ticket.audit_event.action}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <div>
            <span className="text-muted-foreground">Token: </span>
            <span className="font-mono text-xs">{ticket.audit_event.entry_token}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Scanner: </span>
            {original.device_label ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Original: </span>
            {original.original_payload?.gate} / {original.original_payload?.scanner_label}
          </div>
          {original.conflict_payload ? (
            <div>
              <span className="text-muted-foreground">Server says: </span>
              {original.conflict_payload.gate} / {original.conflict_payload.scanner}
            </div>
          ) : null}
        </div>

        {ticket.claim_status !== "resolved" ? (
          <>
            <div className="flex gap-2">
              {ticket.claim_status === "open" ? (
                <Button onClick={claim} disabled={busy}>
                  Claim
                </Button>
              ) : (
                <Button onClick={release} disabled={busy} variant="outline">
                  Release
                </Button>
              )}
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Resolution notes (optional)"
              rows={3}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={resolve("approve_checkin")} disabled={busy} variant="default">
                Approve check-in
              </Button>
              <Button onClick={resolve("resolved_with_note")} disabled={busy} variant="secondary">
                Mark resolved (note)
              </Button>
              <Button onClick={resolve("void")} disabled={busy} variant="destructive">
                Mark void
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="font-medium">Resolved · {ticket.resolution_action}</div>
            {ticket.resolution_notes ? (
              <div className="mt-1 text-muted-foreground">{ticket.resolution_notes}</div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
