"use client";

import { useState } from "react";

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
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{name}</h1>
        <button
          type="button"
          aria-label="Edit organization name"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
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
        className="text-2xl font-semibold rounded border border-input bg-background px-2 py-1 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-ring"
        disabled={mutation.isPending}
      />
      {mutation.isError && (
        <p className="text-sm text-destructive">{extractApiError(mutation.error)}</p>
      )}
    </div>
  );
}
