"use client";

import { useParams } from "next/navigation";

import { EventCreateWizard } from "@/components/events/event-create-wizard";

export default function NewEventPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="max-w-md mx-auto">
      <EventCreateWizard orgSlug={slug} />
    </div>
  );
}
