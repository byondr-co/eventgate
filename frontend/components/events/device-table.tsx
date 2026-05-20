"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDevices, useRevokeDevice, type Device } from "@/lib/devices";

type Props = { orgSlug: string; eventSlug: string };

const ROLE_LABELS: Record<Device["role"], string> = {
  scanner: "Scanner",
  walkin_display: "Walk-in display",
  helpdesk: "Help desk",
};

function deviceState(d: Device): { label: string; tone: string } {
  if (d.revoked_at) return { label: "Revoked", tone: "text-destructive" };
  if (d.enrolled_at) return { label: "Enrolled", tone: "text-green-600" };
  return { label: "Pending enrollment", tone: "text-amber-600" };
}

export function DeviceTable({ orgSlug, eventSlug }: Props) {
  const { data, isLoading, isError } = useDevices(orgSlug, eventSlug);
  const revoke = useRevokeDevice(orgSlug, eventSlug);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrolled devices</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load devices.</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No devices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Label</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Gate</th>
                  <th className="py-2 pr-4 font-medium">State</th>
                  <th className="py-2 pr-4 font-medium">Last seen</th>
                  <th className="py-2 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => {
                  const s = deviceState(d);
                  return (
                    <tr key={d.id} className="border-b last:border-b-0">
                      <td className="py-3 pr-4 font-medium">{d.label}</td>
                      <td className="py-3 pr-4">{ROLE_LABELS[d.role]}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{d.gate || "—"}</td>
                      <td className={`py-3 pr-4 ${s.tone}`}>{s.label}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        {d.revoked_at ? (
                          <span className="text-xs text-muted-foreground">
                            revoked {new Date(d.revoked_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={revoke.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Revoke "${d.label}"? Its device token and any active sessions will stop working immediately.`,
                                )
                              ) {
                                revoke.mutate(d.id);
                              }
                            }}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
