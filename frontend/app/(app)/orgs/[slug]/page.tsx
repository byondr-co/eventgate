"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { EventsTable } from "@/components/events/events-table";
import { OrgNameEditor } from "@/components/orgs/org-name-editor";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useOrg } from "@/lib/orgs";

export function OrgDashboardSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardHeader>
          <CardContent>
            <TableSkeleton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function OrgDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: org, isLoading, isError } = useOrg(slug);

  if (isLoading) return <OrgDashboardSkeleton />;
  if (isError || !org) return <p className="text-sm text-destructive">Organization not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <OrgNameEditor orgSlug={slug} name={org.name} />
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
