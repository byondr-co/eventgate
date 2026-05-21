"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTickets } from "@/lib/helpdesk";

import { TicketDetail } from "./_components/ticket-detail";
import { TicketList } from "./_components/ticket-list";

type Filter = "open" | "claimed" | "resolved" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "claimed", label: "Claimed" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export default function HelpDeskPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, mutate, isLoading } = useTickets(slug, eventSlug, filter);

  const tickets = data?.results ?? [];
  const selected = tickets.find((t) => t.id === selectedId) ?? tickets[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Help desk</h1>
        <div className="flex gap-1">
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
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <TicketList
              tickets={tickets}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
          )}
        </div>
        <div>
          {selected ? (
            <TicketDetail
              ticket={selected}
              orgSlug={slug}
              eventSlug={eventSlug}
              onChanged={() => void mutate()}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a ticket.</p>
          )}
        </div>
      </div>
    </div>
  );
}
