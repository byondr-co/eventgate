"use client";

import { useParams } from "next/navigation";

import { GuestsTable } from "@/components/guests/guests-table";

import { CsvImportDialog } from "./_components/csv-import-dialog";

export default function GuestsPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Guests</h1>
        <CsvImportDialog orgSlug={slug} eventSlug={eventSlug} />
      </div>
      <GuestsTable orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
