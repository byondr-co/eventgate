"use client";

import { useParams } from "next/navigation";

import { EventsTable } from "@/components/events/events-table";

export default function EventsPage() {
  const { slug } = useParams<{ slug: string }>();
  return <EventsTable orgSlug={slug} />;
}
