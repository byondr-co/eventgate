"use client";

import { useParams } from "next/navigation";

import { GuestsTable } from "@/components/guests/guests-table";

export default function GuestsPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Guests</h1>
      <GuestsTable orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
