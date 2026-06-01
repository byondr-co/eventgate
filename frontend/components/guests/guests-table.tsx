"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchTelegramLink, useGuests, useSendQrEmail } from "@/lib/guests";
import { notify } from "@/lib/toast";

const PAGE_SIZES = [25, 50, 100];
const PAGE_SIZE_KEY = "guests.pageSize";

function loadPageSize(): number {
  if (typeof window === "undefined") return PAGE_SIZES[0];
  const saved = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
  return PAGE_SIZES.includes(saved) ? saved : PAGE_SIZES[0];
}

const ENTRY_STATUS_LABELS: Record<string, string> = {
  registered_not_arrived: "Registered, not arrived",
  checked_in: "Checked-in",
  displayed: "Walk-in displayed",
  voided: "Voided",
  manual_review: "Manual review",
};

function entryLabel(status: string): string {
  return ENTRY_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function GuestsTable({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);
  const guests = useGuests(orgSlug, eventSlug, search, page, pageSize);
  const sendQr = useSendQrEmail(orgSlug, eventSlug);

  const onEmail = async (guestId: string) => {
    try {
      await sendQr.mutateAsync(guestId);
      notify.success("QR email queued.");
    } catch (e) {
      notify.error(e);
    }
  };

  const onCopyTelegram = async (guestId: string) => {
    try {
      const { url } = await fetchTelegramLink(orgSlug, eventSlug, guestId);
      await navigator.clipboard.writeText(url);
      notify.success("Telegram link copied.");
    } catch (e) {
      notify.error(e);
    }
  };

  const count = guests.data?.count ?? 0;
  const rows = guests.data?.results ?? [];
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const firstRow = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = (page - 1) * pageSize + rows.length;

  const onSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };
  const onPageSize = (v: number) => {
    setPageSize(v);
    setPage(1);
    if (typeof window !== "undefined") window.localStorage.setItem(PAGE_SIZE_KEY, String(v));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guests {guests.data && `(${count})`}</CardTitle>
      </CardHeader>
      <CardContent>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name, email, or phone…"
          className="mb-4 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {guests.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {guests.data && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {search ? "No matches." : "No registrations yet."}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left font-normal py-2 w-12">No</th>
                    <th className="text-left font-normal py-2">Name</th>
                    <th className="text-left font-normal py-2">Email</th>
                    <th className="text-left font-normal py-2">Phone</th>
                    <th className="text-left font-normal py-2">Type</th>
                    <th className="text-left font-normal py-2">Entry</th>
                    <th className="text-left font-normal py-2">Registered</th>
                    <th className="text-right font-normal py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g, idx) => (
                    <tr key={g.id} className="border-b">
                      <td className="py-2 text-muted-foreground">{firstRow + idx}</td>
                      <td className="py-2">{g.full_name}</td>
                      <td className="py-2">{g.email}</td>
                      <td className="py-2">{g.phone_or_chat}</td>
                      <td className="py-2">
                        {g.guest_type === "walk_in" ? (
                          <Badge variant="secondary">Walk-in</Badge>
                        ) : (
                          <Badge variant="outline">Pre-registered</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        {g.entry_status === "checked_in" ? (
                          <Badge className="bg-green-600 text-white">Checked-in</Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {entryLabel(g.entry_status)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {new Date(g.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-right space-x-2 whitespace-nowrap">
                        {g.guest_type === "walk_in" ? (
                          // Walk-ins are registered at the door; they have no pre-issued QR
                          // to email or Telegram link to share.
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!g.email || sendQr.isPending}
                              onClick={() => onEmail(g.id)}
                            >
                              Email QR
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onCopyTelegram(g.id)}
                            >
                              Copy Telegram link
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <label htmlFor="page-size" className="text-muted-foreground">
                  Rows per page
                </label>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(e) => onPageSize(Number(e.target.value))}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">
                  {firstRow}–{lastRow} of {count}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
