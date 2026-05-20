"use client";

import { useParams } from "next/navigation";

import { MembersTable } from "@/components/orgs/members-table";

export default function MembersPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Members</h1>
      <MembersTable slug={slug} />
    </div>
  );
}
