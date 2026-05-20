"use client";

import { useParams } from "next/navigation";

import { RegistrationFormBuilder } from "@/components/events/registration-form-builder";

export default function EventFormPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Registration form</h1>
      <RegistrationFormBuilder orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
