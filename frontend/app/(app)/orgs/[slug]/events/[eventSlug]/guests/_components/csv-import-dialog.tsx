"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CsvDropZone } from "@/components/events/csv-drop-zone";
import { extractApiError } from "@/lib/api";
import { type PreviewResponse, useCommitMutation, usePreviewMutation } from "@/lib/csv-imports";

type Target = "name" | "email" | "phone" | string | null;

export function CsvImportDialog({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, Target>>({});
  const previewMut = usePreviewMutation(orgSlug, eventSlug);
  const commitMut = useCommitMutation(orgSlug, eventSlug);

  const onFile = async (file: File) => {
    const p = await previewMut.mutateAsync(file);
    setPreview(p);
    setMapping(p.auto_mapping as Record<string, Target>);
  };

  const onCommit = async () => {
    if (!preview) return;
    const result = await commitMut.mutateAsync({
      preview_id: preview.preview_id,
      column_mapping: mapping,
    });
    setOpen(false);
    setPreview(null);
    setMapping({});
    router.push(`/orgs/${orgSlug}/events/${eventSlug}/imports/${result.import_id}`);
  };

  const targetOptions = () => {
    const opts: { value: string; label: string }[] = [
      { value: "", label: "Skip" },
      { value: "name", label: "Name" },
      { value: "email", label: "Email" },
      { value: "phone", label: "Phone" },
    ];
    if (preview) {
      for (const rf of preview.registration_fields) {
        opts.push({ value: rf.id, label: rf.label });
      }
    }
    return opts;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Import CSV
          </Button>
        }
      />
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import guests from CSV</DialogTitle>
        </DialogHeader>

        {!preview && (
          <div className="space-y-4">
            <CsvDropZone onFile={onFile} />
            {previewMut.isError && (
              <p className="text-sm text-destructive">{extractApiError(previewMut.error)}</p>
            )}
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {preview.headers.map((h, i) => {
                      const auto = preview.auto_mapping[String(i)] ?? "";
                      return (
                        <th key={i} className="py-2 pr-3 align-top">
                          <div className="font-medium">{h}</div>
                          <select
                            className="mt-1 rounded-md border border-input bg-transparent px-1 py-0.5 text-[0.7rem] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            value={mapping[String(i)] ?? ""}
                            onChange={(e) =>
                              setMapping((m) => ({
                                ...m,
                                [String(i)]: e.target.value === "" ? null : e.target.value,
                              }))
                            }
                          >
                            {targetOptions().map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                                {auto && o.value === auto ? " (auto)" : ""}
                              </option>
                            ))}
                          </select>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {preview.first_rows.map((row, ri) => (
                    <tr key={ri} className="border-b">
                      {row.map((cell, ci) => (
                        <td key={ci} className="py-1 pr-3 font-mono">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
                Choose another file
              </Button>
              <Button size="sm" onClick={onCommit} disabled={commitMut.isPending}>
                {commitMut.isPending ? "Importing…" : "Import"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
