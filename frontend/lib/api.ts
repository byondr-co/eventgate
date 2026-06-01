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

const GENERIC_ERROR = "Something went wrong. Please try again.";

function isHtmlBody(s: string): boolean {
  const trimmed = s.trimStart();
  return (
    trimmed.startsWith("<") || /<!doctype/i.test(trimmed.slice(0, 20)) || /<html/i.test(trimmed)
  );
}

function parseApiFetchBody(err: unknown): Record<string, unknown> | null {
  if (!(err instanceof Error)) return null;
  const m = err.message.match(/^\d+\s+[^:]*:\s*([\s\S]+)$/);
  if (!m) return null;
  const body = m[1];
  if (isHtmlBody(body)) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function extractApiError(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong.";
  const parsed = parseApiFetchBody(err);
  if (parsed === null) {
    const m = err.message.match(/^\d+\s+[^:]*:\s*([\s\S]+)$/);
    if (!m) return err.message;
    if (isHtmlBody(m[1])) return GENERIC_ERROR;
    return err.message;
  }
  if (typeof parsed.detail === "string") return parsed.detail;
  if (Array.isArray(parsed.non_field_errors)) {
    return (parsed.non_field_errors as unknown[]).map((v) => String(v)).join(" · ");
  }
  return GENERIC_ERROR;
}

export function extractFieldErrors(err: unknown): {
  fieldErrors: Record<string, string>;
  formError: string | null;
} {
  const empty = { fieldErrors: {}, formError: GENERIC_ERROR };
  if (!(err instanceof Error)) return empty;
  const parsed = parseApiFetchBody(err);
  if (parsed === null) return empty;

  if (typeof parsed.detail === "string") {
    return { fieldErrors: {}, formError: parsed.detail };
  }
  if (Array.isArray(parsed.non_field_errors)) {
    const msg = (parsed.non_field_errors as unknown[]).map((v) => String(v)).join(" · ");
    return { fieldErrors: {}, formError: msg };
  }

  const SPECIAL = new Set(["detail", "non_field_errors"]);
  const fieldErrors: Record<string, string> = {};
  for (const key of Object.keys(parsed)) {
    if (SPECIAL.has(key)) continue;
    const val = parsed[key];
    if (Array.isArray(val) && val.length > 0) {
      fieldErrors[key] = String(val[0]);
    } else if (typeof val === "string") {
      fieldErrors[key] = val;
    }
  }
  return { fieldErrors, formError: null };
}
