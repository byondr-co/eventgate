import { RegistrationForm } from "@/components/guests/registration-form";
import { API_BASE } from "@/lib/api";

type Props = { params: Promise<{ orgSlug: string; eventSlug: string }> };

async function loadEvent(orgSlug: string, eventSlug: string): Promise<{ name: string } | null> {
  // Public unauthenticated load — backend's authenticated endpoint may 401/404 here.
  // We accept failure and fall back to using the slug as the title.
  try {
    const res = await fetch(`${API_BASE}/api/v1/orgs/${orgSlug}/events/${eventSlug}/`, {
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
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <RegistrationForm
          orgSlug={orgSlug}
          eventSlug={eventSlug}
          eventName={event?.name ?? eventSlug}
        />
      </div>
    </main>
  );
}
