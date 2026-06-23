"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type GoogleFormBridgeSubmissionSummary = {
  id: string;
  submission_id: string;
  status: "accepted" | "duplicate" | "updated" | "rejected";
  error: string;
  created_at: string;
  processed_at: string | null;
};

export type GoogleFormBridge = {
  id: string;
  name: string;
  enabled: boolean;
  test_mode: boolean;
  field_mapping: Record<string, string>;
  duplicate_policy: "upsert_by_email" | "reject_duplicates";
  webhook_url: string;
  seen_labels: string[];
  last_seen_at: string | null;
  recent_submissions: GoogleFormBridgeSubmissionSummary[];
  created_at: string;
  updated_at: string;
};

export type GoogleFormBridgeWithSecret = GoogleFormBridge & { secret: string };

type Paginated<T> = { count: number; results: T[] };

export type BridgeInput = {
  name?: string;
  enabled?: boolean;
  test_mode?: boolean;
  field_mapping?: Record<string, string>;
  duplicate_policy?: "upsert_by_email" | "reject_duplicates";
};

export type DetectedFields = { seen_labels: string[]; suggestions: Record<string, string> };
export type TestSubmission = {
  id: string;
  status: string;
  error: string;
  created_at: string;
  mapped: Record<string, string>;
  received_fields: Record<string, unknown>;
};

function bridgeBase(orgSlug: string, eventSlug: string) {
  return `/api/v1/orgs/${orgSlug}/events/${eventSlug}/integrations/google-form-bridge/`;
}

export function useGoogleFormBridges(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["google-form-bridges", orgSlug, eventSlug],
    queryFn: () => apiFetch<Paginated<GoogleFormBridge>>(bridgeBase(orgSlug, eventSlug)),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useCreateGoogleFormBridge(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BridgeInput) =>
      apiFetch<GoogleFormBridgeWithSecret>(bridgeBase(orgSlug, eventSlug), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["google-form-bridges", orgSlug, eventSlug],
      }),
  });
}

export function useUpdateGoogleFormBridge(orgSlug: string, eventSlug: string, bridgeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BridgeInput) =>
      apiFetch<GoogleFormBridge>(`${bridgeBase(orgSlug, eventSlug)}${bridgeId}/`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["google-form-bridges", orgSlug, eventSlug],
      }),
  });
}

export function useRotateGoogleFormBridgeSecret(
  orgSlug: string,
  eventSlug: string,
  bridgeId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<GoogleFormBridgeWithSecret>(
        `${bridgeBase(orgSlug, eventSlug)}${bridgeId}/rotate-secret/`,
        { method: "POST" },
      ),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["google-form-bridges", orgSlug, eventSlug],
      }),
  });
}

export function useDetectedFields(
  orgSlug: string,
  eventSlug: string,
  bridgeId: string,
  { poll = false }: { poll?: boolean } = {},
) {
  return useQuery({
    queryKey: ["bridge-detected-fields", orgSlug, eventSlug, bridgeId],
    queryFn: () =>
      apiFetch<DetectedFields>(`${bridgeBase(orgSlug, eventSlug)}${bridgeId}/detected-fields/`),
    enabled: !!bridgeId,
    // While the map step waits for the organizer's first response, poll so newly
    // detected labels appear without a manual refresh.
    refetchInterval: poll ? 2000 : false,
  });
}

export function useTestSubmission(
  orgSlug: string,
  eventSlug: string,
  bridgeId: string,
  { poll }: { poll: boolean },
) {
  return useQuery({
    queryKey: ["bridge-test-submission", orgSlug, eventSlug, bridgeId],
    queryFn: async () => {
      const result = await apiFetch<TestSubmission | null>(
        `${bridgeBase(orgSlug, eventSlug)}${bridgeId}/test-submission/`,
      );
      // apiFetch returns undefined (not null) for 204 — coerce to null for callers
      return result ?? null;
    },
    enabled: !!bridgeId && poll,
    refetchInterval: poll ? 2000 : false,
  });
}
