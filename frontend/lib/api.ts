// Absolute URL of the Django backend. Used for server-side fetches (Next.js SSR
// has no concept of "current origin"). Client-side fetches use a relative path
// so requests go through the Next.js rewrite (configured in next.config.ts) and
// cookies stay same-origin.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type HealthResponse = {
  status: "ok";
  version: string;
  database: "ok" | "error";
};

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health/`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json() as Promise<HealthResponse>;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Browser: use relative path → Vercel rewrites to the backend, cookies same-origin.
  // SSR: use absolute path → direct call to the backend.
  const base = typeof window === "undefined" ? API_BASE : "";
  const isFormData = init.body instanceof FormData;
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export function extractApiError(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong.";
  const m = err.message.match(/^\d+\s+[^:]*:\s*([\s\S]+)$/);
  if (!m) return err.message;
  try {
    const parsed = JSON.parse(m[1]);
    if (typeof parsed?.detail === "string") return parsed.detail;
    if (Array.isArray(parsed?.non_field_errors)) return parsed.non_field_errors.join(" · ");
    return err.message;
  } catch {
    return err.message;
  }
}
