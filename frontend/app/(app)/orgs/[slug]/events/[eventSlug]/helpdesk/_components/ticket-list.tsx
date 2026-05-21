"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { type Ticket } from "@/lib/helpdesk";

type Props = {
  tickets: Ticket[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function TicketList({ tickets, selectedId, onSelect }: Props) {
  if (tickets.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No tickets match this filter.
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="space-y-2">
      {tickets.map((t) => {
        const reason = (t.audit_event.details_json?.reason as string) || t.audit_event.action;
        const isSelected = t.id === selectedId;
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              className={`w-full rounded-md border p-3 text-left hover:bg-accent ${
                isSelected ? "border-primary bg-accent" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant={t.claim_status === "open" ? "destructive" : "secondary"}>
                  {t.claim_status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(t.audit_event.occurred_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium">{reason}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                {t.audit_event.entry_token.slice(0, 16)}…
              </div>
              {t.assigned_to_email ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Claimed by {t.assigned_to_email}
                </div>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
