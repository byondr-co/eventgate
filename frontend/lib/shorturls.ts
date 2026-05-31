"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type ShortUrl = {
  id: string;
  short_code: string;
  target_url: string;
  note: string;
  visit_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

type Paginated<T> = { count: number; results: T[] };

const key = (orgSlug: string, eventSlug: string) => ["short-urls", orgSlug, eventSlug];

export function useShortUrls(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: key(orgSlug, eventSlug),
    queryFn: () =>
      apiFetch<Paginated<ShortUrl>>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/short-urls/`),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useCreateShortUrl(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { note?: string; expires_at?: string | null }) =>
      apiFetch<ShortUrl>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/short-urls/`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgSlug, eventSlug) }),
  });
}

export function useUpdateShortUrl(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      note?: string;
      expires_at?: string | null;
      is_active?: boolean;
    }) =>
      apiFetch<ShortUrl>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/short-urls/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgSlug, eventSlug) }),
  });
}
