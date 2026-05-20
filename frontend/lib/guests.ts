"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type Guest = {
  id: string;
  guest_type: "pre_registered" | "walk_in";
  entry_status: string;
  info_status: string;
  full_name: string;
  email: string;
  phone_or_chat: string;
  custom_fields: Record<string, string>;
  source: string;
  checked_in_at: string | null;
  created_at: string;
};

type Paginated<T> = { count: number; results: T[] };

export function useGuests(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["guests", orgSlug, eventSlug],
    queryFn: () =>
      apiFetch<Paginated<Guest>>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/`),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useRegisterPublic(orgSlug: string, eventSlug: string) {
  return useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiFetch<{ guest_id: string }>(`/api/v1/e/${orgSlug}/${eventSlug}/register/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}
