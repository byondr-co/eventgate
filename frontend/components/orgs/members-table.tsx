"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
import { useMembers, useSendInvite } from "@/lib/orgs";

type Role = "owner" | "admin" | "manager" | "staff";

export function MembersTable({ slug }: { slug: string }) {
  const members = useMembers(slug);
  const invite = useSendInvite(slug);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [success, setSuccess] = useState<string | null>(null);

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    await invite.mutateAsync({ email, role });
    setSuccess(`Invite sent to ${email}.`);
    setEmail("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite member</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onInvite} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
            <Button type="submit" disabled={invite.isPending || !email}>
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
          {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
          {invite.isError && (
            <p className="mt-3 text-sm text-destructive">{extractApiError(invite.error)}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {members.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {members.data && (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Email</th>
                  <th className="text-left font-normal py-2">Role</th>
                  <th className="text-left font-normal py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.data.results.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="py-2">{m.user_email}</td>
                    <td className="py-2">{m.role}</td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(m.accepted_at).toLocaleDateString()}
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
