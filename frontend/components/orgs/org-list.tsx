"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrgs } from "@/lib/orgs";

export function OrgList() {
  const { data, isLoading, isError } = useOrgs();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError) return <p className="text-sm text-destructive">Failed to load.</p>;

  const orgs = data?.results ?? [];

  if (orgs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You don&apos;t belong to any organizations yet. Create one to get started.
          </p>
          <Link href="/orgs/new" className={buttonVariants()}>
            Create organization
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your organizations</h1>
        <Link href="/orgs/new" className={buttonVariants({ variant: "outline" })}>
          New organization
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {orgs.map((o) => (
          <Card key={o.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <Link href={`/orgs/${o.slug}`} className="hover:underline">
                  {o.name}
                </Link>
                <span className="text-xs font-normal text-muted-foreground">{o.role}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{o.slug}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
