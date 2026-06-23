"use client";

import { useParams } from "next/navigation";

import { EventSetupWizard } from "@/components/wizard/event-setup-wizard";

export default function NewEventPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="mx-auto max-w-2xl">
      <EventSetupWizard orgSlug={slug} />
    </div>
  );
}
