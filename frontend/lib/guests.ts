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

export function useGuests(
  orgSlug: string,
  eventSlug: string,
  search = "",
  page = 1,
  pageSize = 25,
) {
  return useQuery({
    queryKey: ["guests", orgSlug, eventSlug, search, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search) params.set("search", search);
      return apiFetch<Paginated<Guest>>(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/?${params.toString()}`,
      );
    },
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useGuestsCount(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["guests-count", orgSlug, eventSlug],
    queryFn: () =>
      apiFetch<Paginated<Guest>>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/?page_size=1`),
    select: (data: Paginated<Guest>) => data.count,
    enabled: !!orgSlug && !!eventSlug,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useSendQrEmail(orgSlug: string, eventSlug: string) {
  return useMutation({
    mutationFn: (guestId: string) =>
      apiFetch<{ status: string }>(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/send-qr-email/`,
        { method: "POST" },
      ),
  });
}

export function fetchTelegramLink(orgSlug: string, eventSlug: string, guestId: string) {
  return apiFetch<{ url: string }>(
    `/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/telegram-link/`,
  );
}

export function useRegisterPublic(orgSlug: string, eventSlug: string) {
  return useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiFetch<{ guest_id: string; entry_token: string }>(
        `/api/v1/e/${orgSlug}/${eventSlug}/register/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
  });
}
