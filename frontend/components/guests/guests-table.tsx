"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
import { fetchTelegramLink, useGuests, useSendQrEmail } from "@/lib/guests";

export function GuestsTable({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const [search, setSearch] = useState("");
  const guests = useGuests(orgSlug, eventSlug, search);
  const sendQr = useSendQrEmail(orgSlug, eventSlug);
  const [notice, setNotice] = useState<string | null>(null);

  const onEmail = async (guestId: string) => {
    setNotice(null);
    try {
      await sendQr.mutateAsync(guestId);
      setNotice("QR email queued.");
    } catch (e) {
      setNotice(extractApiError(e));
    }
  };

  const onCopyTelegram = async (guestId: string) => {
    setNotice(null);
    try {
      const { url } = await fetchTelegramLink(orgSlug, eventSlug, guestId);
      await navigator.clipboard.writeText(url);
      setNotice("Telegram link copied.");
    } catch (e) {
      setNotice(extractApiError(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guests {guests.data && `(${guests.data.count})`}</CardTitle>
      </CardHeader>
      <CardContent>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, or phone…"
          className="mb-4 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {notice && <p className="mb-2 text-sm text-muted-foreground">{notice}</p>}
        {guests.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {guests.data && guests.data.results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {search ? "No matches." : "No registrations yet."}
          </p>
        )}
        {guests.data && guests.data.results.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="text-left font-normal py-2">Name</th>
                <th className="text-left font-normal py-2">Email</th>
                <th className="text-left font-normal py-2">Phone</th>
                <th className="text-left font-normal py-2">Entry</th>
                <th className="text-left font-normal py-2">Registered</th>
                <th className="text-right font-normal py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {guests.data.results.map((g) => (
                <tr key={g.id} className="border-b">
                  <td className="py-2">{g.full_name}</td>
                  <td className="py-2">{g.email}</td>
                  <td className="py-2">{g.phone_or_chat}</td>
                  <td className="py-2">{g.entry_status}</td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(g.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-right space-x-2 whitespace-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!g.email || sendQr.isPending}
                      onClick={() => onEmail(g.id)}
                    >
                      Email QR
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onCopyTelegram(g.id)}>
                      Copy Telegram link
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
