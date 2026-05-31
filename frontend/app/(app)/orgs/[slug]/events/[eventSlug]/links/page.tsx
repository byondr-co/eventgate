"use client";

import { useParams } from "next/navigation";

import { LinksTable } from "@/components/shorturls/links-table";

export default function EventLinksPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Links</h1>
      <LinksTable orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
