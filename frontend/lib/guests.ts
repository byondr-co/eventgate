"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

export type GuestFilters = {
  search?: string;
  ordering?: string;
  page?: number;
  pageSize?: number;
  entryStatus?: string;
  guestType?: string;
};

export function useGuests(orgSlug: string, eventSlug: string, filters: GuestFilters = {}) {
  const {
    search = "",
    ordering = "",
    page = 1,
    pageSize = 25,
    entryStatus = "",
    guestType = "",
  } = filters;
  return useQuery({
    queryKey: [
      "guests",
      orgSlug,
      eventSlug,
      search,
      ordering,
      page,
      pageSize,
      entryStatus,
      guestType,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search) params.set("search", search);
      if (ordering) params.set("ordering", ordering);
      if (entryStatus) params.set("entry_status", entryStatus);
      if (guestType) params.set("guest_type", guestType);
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

export type GuestEditInput = Partial<
  Pick<Guest, "full_name" | "email" | "phone_or_chat" | "custom_fields">
>;

function invalidateGuests(
  qc: ReturnType<typeof useQueryClient>,
  orgSlug: string,
  eventSlug: string,
) {
  qc.invalidateQueries({ queryKey: ["guests", orgSlug, eventSlug] });
  qc.invalidateQueries({ queryKey: ["guests-count", orgSlug, eventSlug] });
}

export function useUpdateGuest(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ guestId, data }: { guestId: string; data: GuestEditInput }) =>
      apiFetch<Guest>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => invalidateGuests(qc, orgSlug, eventSlug),
  });
}

export function useVoidGuest(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (guestId: string) =>
      apiFetch<Guest>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/void/`, {
        method: "POST",
      }),
    onSuccess: () => invalidateGuests(qc, orgSlug, eventSlug),
  });
}

export function useDeleteGuest(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (guestId: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/${guestId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateGuests(qc, orgSlug, eventSlug),
  });
}

export type BulkAction = "void" | "resend_qr" | "delete";
export type BulkResult = {
  action: BulkAction;
  done: number;
  skipped: { id: string; reason: string }[];
  errors: { id: string; error: string }[];
};

export function useBulkGuests(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, guestIds }: { action: BulkAction; guestIds: string[] }) =>
      apiFetch<BulkResult>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/bulk/`, {
        method: "POST",
        body: JSON.stringify({ action, guest_ids: guestIds }),
      }),
    onSuccess: () => invalidateGuests(qc, orgSlug, eventSlug),
  });
}

export type ExportOpts = {
  filters?: { search?: string; entry_status?: string; guest_type?: string; ordering?: string };
  ids?: string[];
};

export async function exportGuestsCsv(
  orgSlug: string,
  eventSlug: string,
  opts: ExportOpts,
): Promise<void> {
  // Raw fetch (not apiFetch — we need the CSV blob, not JSON). Cookie-auth via credentials.
  const res = await fetch(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/export/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${eventSlug}-guests.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
