"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  country_code: string;
  default_timezone: string;
  plan: string;
  created_at: string;
  role: "owner" | "admin" | "manager" | "staff" | null;
};

export type Member = {
  id: string;
  user_email: string;
  user_full_name: string;
  role: Organization["role"];
  is_active: boolean;
  accepted_at: string;
  created_at: string;
};

type Paginated<T> = { count: number; results: T[] };

export const ORGS_QUERY_KEY = ["orgs"] as const;

export function useOrgs() {
  return useQuery({
    queryKey: ORGS_QUERY_KEY,
    queryFn: () => apiFetch<Paginated<Organization>>("/api/v1/orgs/"),
  });
}

export function useOrg(slug: string) {
  return useQuery({
    queryKey: ["orgs", slug],
    queryFn: () => apiFetch<Organization>(`/api/v1/orgs/${slug}/`),
    enabled: !!slug,
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<Organization>("/api/v1/orgs/", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORGS_QUERY_KEY }),
  });
}

export function useMembers(slug: string) {
  return useQuery({
    queryKey: ["orgs", slug, "members"],
    queryFn: () => apiFetch<Paginated<Member>>(`/api/v1/orgs/${slug}/members/`),
    enabled: !!slug,
  });
}

export function useSendInvite(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: NonNullable<Organization["role"]> }) =>
      apiFetch<{ id: string; email: string; role: string }>(`/api/v1/orgs/${slug}/invites/`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs", slug, "members"] }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<{ organization: Organization; role: string }>(
        `/api/v1/auth/invites/${token}/accept/`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORGS_QUERY_KEY }),
  });
}
