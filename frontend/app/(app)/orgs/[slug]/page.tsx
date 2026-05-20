"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { EventsTable } from "@/components/events/events-table";
import { buttonVariants } from "@/components/ui/button";
import { useOrg } from "@/lib/orgs";

export default function OrgDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: org, isLoading, isError } = useOrg(slug);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !org) return <p className="text-sm text-destructive">Organization not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <p className="text-sm text-muted-foreground">
            {org.slug} · {org.role}
          </p>
        </div>
        <Link href={`/orgs/${slug}/members`} className={buttonVariants({ variant: "outline" })}>
          Members
        </Link>
      </div>
      <EventsTable orgSlug={slug} />
    </div>
  );
}
