"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type EventStatus = "draft" | "open" | "live" | "closed" | "archived";

export type Event = {
  id: string;
  name: string;
  slug: string;
  status: EventStatus;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue: string;
  registration_open: boolean;
  walkins_enabled: boolean;
  created_at: string;
};

export type FieldType = "text" | "email" | "phone" | "textarea" | "select";

export type RegistrationField = {
  id: string;
  field_key: string;
  label_en: string;
  label_km: string;
  field_type: FieldType;
  required: boolean;
  options_json: string[];
  order_index: number;
  is_preset: boolean;
};

/** Shape returned by the public, anonymous GET /api/v1/e/<org>/<event>/ endpoint.
 *  No id, no event_pin_hash, no created_at — just what the registration /
 *  claim pages need. */
export type PublicEventField = {
  field_key: string;
  label_en: string;
  label_km: string;
  field_type: FieldType;
  required: boolean;
  options: string[];
  order_index: number;
};

export type PublicEventDetail = {
  org_slug: string;
  slug: string;
  name: string;
  venue: string;
  status: EventStatus;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  registration_open: boolean;
  walkins_enabled: boolean;
  fields: PublicEventField[];
};

export function usePublicEventDetail(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["public-event", orgSlug, eventSlug],
    queryFn: async (): Promise<PublicEventDetail> => {
      const res = await fetch(`/api/v1/e/${orgSlug}/${eventSlug}/`);
      if (!res.ok) throw new Error("event_not_found");
      return res.json();
    },
    enabled: !!orgSlug && !!eventSlug,
  });
}

type Paginated<T> = { count: number; results: T[] };

export function useEvents(orgSlug: string) {
  return useQuery({
    queryKey: ["events", orgSlug],
    queryFn: () => apiFetch<Paginated<Event>>(`/api/v1/orgs/${orgSlug}/events/`),
    enabled: !!orgSlug,
  });
}

export function useEvent(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["events", orgSlug, eventSlug],
    queryFn: () => apiFetch<Event>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/`),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useCreateEvent(orgSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      slug: string;
      venue?: string;
      starts_at?: string;
      ends_at?: string;
    }) =>
      apiFetch<Event>(`/api/v1/orgs/${orgSlug}/events/`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", orgSlug] }),
  });
}

export function useFields(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["events", orgSlug, eventSlug, "fields"],
    queryFn: () =>
      apiFetch<Paginated<RegistrationField>>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/fields/`),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useAddField(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      field_key: string;
      label_en: string;
      label_km?: string;
      field_type: FieldType;
      required: boolean;
      order_index: number;
    }) =>
      apiFetch<RegistrationField>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/fields/`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", orgSlug, eventSlug, "fields"] }),
  });
}

export function useDeleteField(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (field_key: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/fields/${field_key}/`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", orgSlug, eventSlug, "fields"] }),
  });
}
