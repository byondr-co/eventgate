"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateShortUrl, useShortUrls, useUpdateShortUrl } from "@/lib/shorturls";
import { notify } from "@/lib/toast";

export function LinksTable({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const links = useShortUrls(orgSlug, eventSlug);
  const create = useCreateShortUrl(orgSlug, eventSlug);
  const update = useUpdateShortUrl(orgSlug, eventSlug);
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const shortUrl = (code: string) =>
    typeof window === "undefined" ? `/r/${code}` : `${window.location.origin}/r/${code}`;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({ note, expires_at: expiresAt || null });
      setNote("");
      setExpiresAt("");
      notify.success("Link created.");
    } catch (err) {
      notify.error(err);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(shortUrl(code));
      notify.success("Link copied.");
    } catch {
      notify.error("Could not copy.");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New registration link</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Label (e.g. Instagram bio)"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "New link"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Short links {links.data && `(${links.data.count})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {links.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {links.data && links.data.results.length === 0 && (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          )}
          {links.data && links.data.results.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Short link</th>
                  <th className="text-left font-normal py-2">Visits</th>
                  <th className="text-left font-normal py-2">Note</th>
                  <th className="text-left font-normal py-2">Expires</th>
                  <th className="text-right font-normal py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {links.data.results.map((s) => (
                  <tr key={s.id} className={`border-b ${s.is_active ? "" : "opacity-50"}`}>
                    <td className="py-2 font-mono text-xs">/r/{s.short_code}</td>
                    <td className="py-2">{s.visit_count}</td>
                    <td className="py-2">
                      <input
                        defaultValue={s.note}
                        onBlur={(e) => {
                          if (e.target.value !== s.note)
                            update.mutate({ id: s.id, note: e.target.value });
                        }}
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="date"
                        defaultValue={s.expires_at ? s.expires_at.slice(0, 10) : ""}
                        onChange={(e) =>
                          update.mutate({ id: s.id, expires_at: e.target.value || null })
                        }
                        className="rounded border border-input bg-background px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="py-2 text-right space-x-2 whitespace-nowrap">
                      <Button variant="outline" size="sm" onClick={() => copy(s.short_code)}>
                        Copy
                      </Button>
                      {s.is_active ? (
                        <ConfirmDialog
                          trigger={
                            <Button variant="outline" size="sm">
                              Disable
                            </Button>
                          }
                          title="Disable this link?"
                          description="Visitors using it will get a 404. You can re-enable it later."
                          confirmLabel="Disable"
                          onConfirm={() => update.mutate({ id: s.id, is_active: false })}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => update.mutate({ id: s.id, is_active: true })}
                        >
                          Enable
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
