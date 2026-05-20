"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type User = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  last_login_at: string | null;
};

export const ME_QUERY_KEY = ["me"] as const;

export function useMe() {
  return useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await apiFetch<User>("/api/v1/auth/me/");
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}

export function useRequestMagicLink() {
  return useMutation({
    mutationFn: async (email: string) => {
      await apiFetch<void>("/api/v1/auth/magic-link/request/", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
  });
}

export function useConsumeMagicLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const result = await apiFetch<{ user: User }>("/api/v1/auth/magic-link/consume/", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      return result.user;
    },
    onSuccess: (user) => qc.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiFetch<void>("/api/v1/auth/logout/", { method: "POST" });
    },
    onSuccess: () => qc.setQueryData(ME_QUERY_KEY, null),
  });
}
