"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { extractApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  useCancelInvite,
  useMembers,
  usePendingInvites,
  useRemoveMembership,
  useSendInvite,
  useUpdateMembership,
} from "@/lib/orgs";

type Role = "owner" | "admin" | "manager" | "staff";

const PAGE_SIZES = [25, 50, 100];
const PAGE_SIZE_KEY = "members.pageSize";

function loadPageSize(): number {
  if (typeof window === "undefined") return PAGE_SIZES[0];
  const saved = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
  return PAGE_SIZES.includes(saved) ? saved : PAGE_SIZES[0];
}

export function MembersTable({ slug }: { slug: string }) {
  const [ordering, setOrdering] = useState("user__email");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);

  const members = useMembers(slug, { ordering, page, pageSize });
  const invites = usePendingInvites(slug);
  const invite = useSendInvite(slug);
  const updateRole = useUpdateMembership(slug);
  const removeMember = useRemoveMembership(slug);
  const cancelInvite = useCancelInvite(slug);
  const me = useMe();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [success, setSuccess] = useState<string | null>(null);

  const count = members.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const toggleSort = (field: string) => {
    setOrdering((o) => (o === field ? `-${field}` : field));
    setPage(1);
  };

  const onPageSize = (v: number) => {
    setPageSize(v);
    setPage(1);
    if (typeof window !== "undefined") window.localStorage.setItem(PAGE_SIZE_KEY, String(v));
  };

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
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </Select>
            <Button type="submit" disabled={invite.isPending || !email}>
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
          {success && <p className="mt-3 text-sm text-success">{success}</p>}
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
          {members.isLoading && <TableSkeleton />}
          {members.data && (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => toggleSort("user__email")}
                    >
                      Email
                    </button>
                  </th>
                  <th className="text-left font-normal py-2">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => toggleSort("role")}
                    >
                      Role
                    </button>
                  </th>
                  <th className="text-left font-normal py-2">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => toggleSort("accepted_at")}
                    >
                      Joined
                    </button>
                  </th>
                  <th className="text-right font-normal py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.data.results.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="py-2">{m.user_email}</td>
                    <td className="py-2">
                      {m.role === "owner" ? (
                        <span className="text-xs font-medium">Owner</span>
                      ) : (
                        <select
                          value={m.role ?? ""}
                          onChange={(e) =>
                            updateRole.mutate({ membershipId: m.id, role: e.target.value })
                          }
                          disabled={updateRole.isPending || m.user_email === me.data?.email}
                          className="rounded border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="staff">Staff</option>
                        </select>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(m.accepted_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right">
                      <span className="space-x-2 whitespace-nowrap">
                        {m.role !== "owner" && m.user_email !== me.data?.email && (
                          <ConfirmDialog
                            trigger={
                              <Button variant="outline" size="sm">
                                Make owner
                              </Button>
                            }
                            title="Make this member an owner?"
                            description={`${m.user_email} will gain full owner permissions. Owners can manage billing, members, and all events.`}
                            confirmLabel="Make owner"
                            destructive={false}
                            onConfirm={() =>
                              updateRole.mutate({ membershipId: m.id, role: "owner" })
                            }
                          />
                        )}
                        {m.user_email !== me.data?.email && (
                          <ConfirmDialog
                            trigger={
                              <Button variant="outline" size="sm" disabled={removeMember.isPending}>
                                Remove
                              </Button>
                            }
                            title="Remove member?"
                            description={`Remove ${m.user_email} from this organization?`}
                            confirmLabel="Remove"
                            onConfirm={() => removeMember.mutate(m.id)}
                          />
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {updateRole.isError && (
            <p className="mt-2 text-sm text-destructive">{extractApiError(updateRole.error)}</p>
          )}
          {removeMember.isError && (
            <p className="mt-2 text-sm text-destructive">{extractApiError(removeMember.error)}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <label htmlFor="mem-page-size" className="text-muted-foreground">
                Rows per page
              </label>
              <Select
                id="mem-page-size"
                value={pageSize}
                onChange={(e) => onPageSize(Number(e.target.value))}
                className="w-auto"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-3">
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
        </CardContent>
      </Card>

      {invites.data && invites.data.count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites ({invites.data.count})</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Email</th>
                  <th className="text-left font-normal py-2">Role</th>
                  <th className="text-left font-normal py-2">Expires</th>
                  <th className="text-right font-normal py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.data.results.map((i) => (
                  <tr key={i.id} className="border-b">
                    <td className="py-2">{i.email}</td>
                    <td className="py-2">{i.role}</td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(i.expires_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cancelInvite.isPending}
                        onClick={() => cancelInvite.mutate(i.id)}
                      >
                        Cancel
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cancelInvite.isError && (
              <p className="mt-2 text-sm text-destructive">{extractApiError(cancelInvite.error)}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
