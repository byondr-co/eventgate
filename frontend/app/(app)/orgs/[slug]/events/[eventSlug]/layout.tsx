import type { ReactNode } from "react";

import { EventTabsNav } from "@/components/nav/event-tabs-nav";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string; eventSlug: string }>;
};

export default async function EventLayout({ children, params }: Props) {
  const { slug, eventSlug } = await params;
  return (
    <div className="space-y-4">
      <EventTabsNav orgSlug={slug} eventSlug={eventSlug} />
      {children}
    </div>
  );
}
