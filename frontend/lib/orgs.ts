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

export type MemberListFilters = {
  ordering?: string;
  page?: number;
  pageSize?: number;
};

export function useMembers(slug: string, filters: MemberListFilters = {}) {
  const { ordering = "", page = 1, pageSize = 25 } = filters;
  return useQuery({
    queryKey: ["orgs", slug, "members", ordering, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (ordering) params.set("ordering", ordering);
      return apiFetch<Paginated<Member>>(`/api/v1/orgs/${slug}/members/?${params.toString()}`);
    },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", slug] }),
  });
}

export function useUpdateOrg(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      apiFetch<Organization>(`/api/v1/orgs/${slug}/`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      qc.setQueryData(["orgs", slug], data);
      qc.invalidateQueries({ queryKey: ORGS_QUERY_KEY });
    },
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

export type Membership = {
  id: string;
  user_email: string;
  user_full_name: string;
  role: NonNullable<Organization["role"]>;
  is_active: boolean;
  accepted_at: string;
  created_at: string;
};

export type Invite = {
  id: string;
  email: string;
  role: NonNullable<Organization["role"]>;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export function useUpdateMembership(orgSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: string }) =>
      apiFetch<Membership>(`/api/v1/orgs/${orgSlug}/memberships/${membershipId}/`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs", orgSlug, "members"] }),
  });
}

export function useRemoveMembership(orgSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/memberships/${membershipId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs", orgSlug, "members"] }),
  });
}

export function useCancelInvite(orgSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/invites/${inviteId}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", orgSlug] }),
  });
}

export function usePendingInvites(orgSlug: string) {
  return useQuery({
    queryKey: ["invites", orgSlug],
    queryFn: () =>
      apiFetch<{ count: number; results: Invite[] }>(`/api/v1/orgs/${orgSlug}/invites/`),
    enabled: !!orgSlug,
  });
}
