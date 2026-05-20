"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGuests } from "@/lib/guests";

export function GuestsTable({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const guests = useGuests(orgSlug, eventSlug);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guests {guests.data && `(${guests.data.count})`}</CardTitle>
      </CardHeader>
      <CardContent>
        {guests.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {guests.data && guests.data.results.length === 0 && (
          <p className="text-sm text-muted-foreground">No registrations yet.</p>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
