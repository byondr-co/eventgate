"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { extractApiError } from "@/lib/api";
import { useUpdateOrg } from "@/lib/orgs";

type Props = { orgSlug: string; name: string };

export function OrgNameEditor({ orgSlug, name }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const mutation = useUpdateOrg(orgSlug);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      setDraft(name);
      return;
    }
    try {
      await mutation.mutateAsync({ name: trimmed });
      setEditing(false);
    } catch {
      // error renders inline; stay in edit mode
    }
  };

  const cancel = () => {
    setEditing(false);
    setDraft(name);
    mutation.reset();
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-2xl font-semibold min-w-0 break-words">{name}</h1>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Edit organization name"
          onClick={() => setEditing(true)}
        >
          ✎
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          else if (e.key === "Escape") cancel();
        }}
        className="w-full max-w-md rounded border border-input bg-background px-2 py-1 text-2xl font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        disabled={mutation.isPending}
      />
      {mutation.isError && (
        <p className="text-sm text-destructive">{extractApiError(mutation.error)}</p>
      )}
    </div>
  );
}
