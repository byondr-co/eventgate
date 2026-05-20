"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type DeviceRole = "scanner" | "walkin_display" | "helpdesk";

export type Device = {
  id: string;
  label: string;
  role: DeviceRole;
  gate: string;
  enrolled_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type DeviceCreateResponse = Device & {
  device_id: string;
  enrollment_code: string;
};

export function useDevices(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["devices", orgSlug, eventSlug],
    queryFn: () => apiFetch<Device[]>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/devices/`),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useCreateDevice(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; role: DeviceRole; gate?: string }) =>
      apiFetch<DeviceCreateResponse>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/devices/`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices", orgSlug, eventSlug] }),
  });
}

export function useRevokeDevice(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/devices/${deviceId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices", orgSlug, eventSlug] }),
  });
}

export type PinSetResponse = {
  detail: string;
  rotated_at: string;
};

export function useSetPin(orgSlug: string, eventSlug: string) {
  return useMutation({
    mutationFn: (pin: string) =>
      apiFetch<PinSetResponse>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/pin/set/`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
  });
}
