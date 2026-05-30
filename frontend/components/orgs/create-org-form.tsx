"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
import { useCreateOrg } from "@/lib/orgs";

export function CreateOrgForm() {
  const [name, setName] = useState("");
  const create = useCreateOrg();
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const org = await create.mutateAsync(name);
    router.push(`/orgs/${org.slug}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create organization</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            required
            minLength={2}
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="byondr.co"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" disabled={create.isPending || !name} className="w-full">
            {create.isPending ? "Creating…" : "Create"}
          </Button>
          {create.isError && (
            <p className="text-sm text-destructive">{extractApiError(create.error)}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
