"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type ShortUrl = {
  id: string;
  short_code: string;
  target_url: string;
  created_at: string;
};

export function useEventShortUrl(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["short-url", orgSlug, eventSlug],
    queryFn: () =>
      apiFetch<{ count: number; results: ShortUrl[] }>(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/short-urls/`,
      ),
    select: (data) => data.results[0] ?? null,
    enabled: !!orgSlug && !!eventSlug,
  });
}
