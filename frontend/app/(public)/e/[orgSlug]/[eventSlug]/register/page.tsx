import { getTranslations } from "next-intl/server";

import { RegistrationForm } from "@/components/guests/registration-form";
import { EmptyState } from "@/components/ui/empty-state";
import { API_BASE } from "@/lib/api";
import type { PublicEventDetail } from "@/lib/events";
import { NoEvents } from "@/lib/illustrations";

type Props = { params: Promise<{ orgSlug: string; eventSlug: string }> };

async function loadEvent(orgSlug: string, eventSlug: string): Promise<PublicEventDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/e/${orgSlug}/${eventSlug}/`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function RegisterPage({ params }: Props) {
  const { orgSlug, eventSlug } = await params;
  const event = await loadEvent(orgSlug, eventSlug);
  const t = await getTranslations("register");

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          <EmptyState illustration={NoEvents} title={t("eventNotFound")} />
        </div>
      </main>
    );
  }

  if (!event.registration_open) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          <EmptyState
            illustration={NoEvents}
            title={event.name}
            message={
              event.venue ? `${event.venue} · ${t("registrationClosed")}` : t("registrationClosed")
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <RegistrationForm
          orgSlug={orgSlug}
          eventSlug={eventSlug}
          eventName={event.name}
          venue={event.venue}
          fields={event.fields}
          bannerImage={event.banner_image}
          description={event.description}
        />
      </div>
    </main>
  );
}
