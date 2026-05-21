"use client";

/**
 * Per-fetcher in-memory ETag cache.
 *
 * `cachedFetchJSON` issues a GET to `url`, sending the last seen ETag for
 * that URL as `If-None-Match`. On 304 it returns the last-known body (no
 * re-parse). On 200 it stores the new ETag + body and returns the parsed
 * body.
 *
 * State is per `EtagCache` instance, so each library file (helpdesk, audit,
 * event-stats) owns its own cache and there's no cross-feature coupling.
 *
 * Trade-offs:
 * - In-memory only: cache is lost on tab reload. SWR / TanStack Query
 *   handle disk-equivalent rehydration themselves; this layer just
 *   short-circuits the network round-trip during a single session.
 * - No SWR/RQ integration: the caller still pays for the React render,
 *   but the wire payload + JSON parse is skipped on 304.
 */

export type EtagCache = {
  fetchJSON: <T>(url: string) => Promise<T>;
};

export function createEtagCache(): EtagCache {
  const cache = new Map<string, { etag: string; body: unknown }>();

  return {
    async fetchJSON<T>(url: string): Promise<T> {
      const prior = cache.get(url);
      const headers: Record<string, string> = {};
      if (prior) headers["If-None-Match"] = prior.etag;

      const r = await fetch(url, { credentials: "include", headers });

      if (r.status === 304 && prior) {
        return prior.body as T;
      }
      if (!r.ok) {
        throw new Error(`${r.status} ${r.statusText}`);
      }
      const body = (await r.json()) as T;
      const newEtag = r.headers.get("ETag");
      if (newEtag) {
        cache.set(url, { etag: newEtag, body });
      }
      return body;
    },
  };
}
