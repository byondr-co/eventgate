"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { type InboxItem, useManualReviewGuests, useTickets } from "@/lib/helpdesk";

import { ManualReviewDetail } from "./_components/manual-review-detail";
import { TicketDetail } from "./_components/ticket-detail";
import { InboxList } from "./_components/ticket-list";

type Filter = "open" | "claimed" | "resolved" | "manual_review" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "claimed", label: "Claimed" },
  { value: "resolved", label: "Resolved" },
  { value: "manual_review", label: "Manual review" },
  { value: "all", label: "All" },
];

export default function HelpDeskPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const wantTickets = filter !== "manual_review";
  const wantManualReview = filter === "manual_review" || filter === "all";

  const ticketsQuery = useTickets(slug, eventSlug, filter === "manual_review" ? "open" : filter);
  const manualQuery = useManualReviewGuests(slug, eventSlug, wantManualReview);

  const items: InboxItem[] = useMemo(() => {
    const out: InboxItem[] = [];
    if (wantTickets) {
      for (const t of ticketsQuery.data?.results ?? []) {
        out.push({
          type: "ticket",
          key: `t-${t.id}`,
          sortAt: t.audit_event.occurred_at,
          ticket: t,
        });
      }
    }
    if (wantManualReview) {
      for (const g of manualQuery.data?.results ?? []) {
        out.push({
          type: "manual_review",
          key: `g-${g.id}`,
          sortAt: g.updated_at,
          guest: g,
        });
      }
    }
    return out.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  }, [wantTickets, wantManualReview, ticketsQuery.data, manualQuery.data]);

  const selected = items.find((i) => i.key === selectedKey) ?? items[0] ?? null;

  const refresh = () => {
    void ticketsQuery.mutate();
    void manualQuery.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Help desk</h1>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[40%_1fr]">
        <div>
          <InboxList items={items} selectedKey={selected?.key ?? null} onSelect={setSelectedKey} />
        </div>
        <div>
          {selected?.type === "ticket" ? (
            <TicketDetail
              ticket={selected.ticket}
              orgSlug={slug}
              eventSlug={eventSlug}
              onChanged={refresh}
            />
          ) : selected?.type === "manual_review" ? (
            <ManualReviewDetail
              guest={selected.guest}
              orgSlug={slug}
              eventSlug={eventSlug}
              onChanged={refresh}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select an item.</p>
          )}
        </div>
      </div>
    </div>
  );
}
