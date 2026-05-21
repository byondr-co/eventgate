"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { type InboxItem } from "@/lib/helpdesk";

type Props = {
  items: InboxItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export function InboxList({ items, selectedKey, onSelect }: Props) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No items match this filter.
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isSelected = item.key === selectedKey;
        const classes = `w-full text-left rounded-md border p-3 hover:bg-accent ${
          isSelected ? "border-primary bg-accent" : "border-border"
        }`;
        if (item.type === "ticket") {
          const t = item.ticket;
          const reason = (t.audit_event.details_json?.reason as string) || t.audit_event.action;
          return (
            <li key={item.key}>
              <button type="button" onClick={() => onSelect(item.key)} className={classes}>
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
        }
        const g = item.guest;
        return (
          <li key={item.key}>
            <button type="button" onClick={() => onSelect(item.key)} className={classes}>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="destructive">manual review</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(g.updated_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium">{g.full_name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {g.email || g.phone_or_chat || "—"}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
