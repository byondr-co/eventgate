"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type RegistrationFieldRef = {
  id: string;
  label: string;
  field_key: string;
};

export type PreviewResponse = {
  preview_id: string;
  headers: string[];
  first_rows: string[][];
  auto_mapping: Record<string, string | null>;
  registration_fields: RegistrationFieldRef[];
};

export type ImportStatus = {
  id: string;
  status: "preview" | "pending" | "running" | "complete" | "failed";
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  error_report_url: string | null;
  created_at: string;
  completed_at: string | null;
};

export function usePreviewMutation(orgSlug: string, eventSlug: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<PreviewResponse> => {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/imports/preview/`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({ detail: `${r.status}` }))) as {
          detail?: string;
        };
        throw new Error(body.detail ?? `${r.status}`);
      }
      return (await r.json()) as PreviewResponse;
    },
  });
}

export function useCommitMutation(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      preview_id: string;
      column_mapping: Record<string, string | null>;
    }): Promise<{ import_id: string; status: string; total_rows: number }> => {
      const r = await fetch(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/imports/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return (await r.json()) as {
        import_id: string;
        status: string;
        total_rows: number;
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["guests", orgSlug, eventSlug] });
    },
  });
}

export function useImportStatus(orgSlug: string, eventSlug: string, importId: string | null) {
  return useQuery<ImportStatus>({
    queryKey: ["csv-import", orgSlug, eventSlug, importId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/imports/${importId}/`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return (await r.json()) as ImportStatus;
    },
    enabled: !!importId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "complete" || s === "failed" ? false : 2000;
    },
  });
}
