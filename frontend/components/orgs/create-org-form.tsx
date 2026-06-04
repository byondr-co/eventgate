"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
          <Field label="Organization name" htmlFor="org-name">
            <Input
              id="org-name"
              type="text"
              required
              minLength={2}
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="byondr.co"
            />
          </Field>
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
