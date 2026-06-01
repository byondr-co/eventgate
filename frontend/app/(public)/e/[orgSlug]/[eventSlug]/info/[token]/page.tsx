import { WalkinInfoForm } from "@/components/walkins/info-form";
import { API_BASE } from "@/lib/api";
import type { PublicEventDetail } from "@/lib/events";

type Props = {
  params: Promise<{ orgSlug: string; eventSlug: string; token: string }>;
};

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

export default async function WalkinInfoPage({ params }: Props) {
  const { orgSlug, eventSlug, token } = await params;
  const event = await loadEvent(orgSlug, eventSlug);

  if (!event) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <p className="text-sm text-muted-foreground">Event not found.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <WalkinInfoForm
          orgSlug={orgSlug}
          eventSlug={eventSlug}
          token={token}
          eventName={event.name}
          fields={event.fields}
          bannerImage={event.banner_image}
          description={event.description}
        />
      </div>
    </main>
  );
}
