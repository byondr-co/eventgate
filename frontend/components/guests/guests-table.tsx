"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { NoGuests } from "@/lib/illustrations";
import { useFields, type RegistrationField } from "@/lib/events";
import { fetchTelegramLink, useGuests, useSendQrEmail, type Guest } from "@/lib/guests";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

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

// Preset field keys map to dedicated Guest columns; everything else lives in custom_fields.
const PRESET_VALUE: Record<string, (g: Guest) => string> = {
  name: (g) => g.full_name,
  email: (g) => g.email,
  phone_or_chat: (g) => g.phone_or_chat,
};

function fieldValue(g: Guest, key: string): string {
  const preset = PRESET_VALUE[key];
  return preset ? preset(g) : (g.custom_fields?.[key] ?? "");
}

export function GuestsTable({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);
  const [guestType, setGuestType] = useState("");
  const [entryStatus, setEntryStatus] = useState("");
  const guests = useGuests(orgSlug, eventSlug, { search, page, pageSize, guestType, entryStatus });
  const fields = useFields(orgSlug, eventSlug);
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

  // Data columns are driven by the event's registration form (sorted by order_index).
  const regFields: RegistrationField[] = (fields.data?.results ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index);
  const fieldLabel = (f: RegistrationField) =>
    locale === "km" && f.label_km ? f.label_km : f.label_en;

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
  const clearFilters = () => {
    setSearch("");
    setGuestType("");
    setEntryStatus("");
    setPage(1);
  };
  const stickyLeft = "sticky left-0 z-10 bg-card";
  const stickyRight = "sticky right-0 z-10 bg-card";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guests {guests.data && `(${count})`}</CardTitle>
      </CardHeader>
      <CardContent>
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name, email, or phone…"
          className="mb-3 max-w-sm"
        />
        <div className="mb-4 flex flex-wrap gap-3">
          <SegmentedControl
            aria-label="Filter by guest type"
            options={[
              { value: "", label: "All" },
              { value: "walk_in", label: "Walk-in" },
              { value: "pre_registered", label: "Pre-registered" },
            ]}
            value={guestType}
            onValueChange={(v) => {
              setGuestType(v);
              setPage(1);
            }}
          />
          <SegmentedControl
            aria-label="Filter by entry status"
            options={[
              { value: "", label: "All" },
              { value: "checked_in", label: "Checked-in" },
              { value: "registered_not_arrived", label: "Not arrived" },
            ]}
            value={entryStatus}
            onValueChange={(v) => {
              setEntryStatus(v);
              setPage(1);
            }}
          />
        </div>
        {guests.isLoading && <TableSkeleton />}
        {guests.data && rows.length === 0 ? (
          search || guestType || entryStatus ? (
            <EmptyState
              illustration={NoGuests}
              title="No matching guests"
              message="Try a different search or clear the filters."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              illustration={NoGuests}
              title="No registrations yet"
              message="Guests appear here as they register or are imported."
            />
          )
        ) : null}
        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className={cn(stickyLeft, "w-12 text-left font-normal py-2")}>No</th>
                    {regFields.map((f) => (
                      <th
                        key={f.field_key}
                        className="text-left font-normal py-2 whitespace-nowrap"
                      >
                        {fieldLabel(f)}
                      </th>
                    ))}
                    <th className="text-left font-normal py-2">Type</th>
                    <th className="text-left font-normal py-2">Entry</th>
                    <th className="text-left font-normal py-2">Registered</th>
                    <th className={cn(stickyRight, "text-right font-normal py-2")}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g, idx) => (
                    <tr key={g.id} className="border-b">
                      <td className={cn(stickyLeft, "py-2 text-muted-foreground")}>
                        {firstRow + idx}
                      </td>
                      {regFields.map((f) => (
                        <td key={f.field_key} className="py-2 whitespace-nowrap">
                          {fieldValue(g, f.field_key)}
                        </td>
                      ))}
                      <td className="py-2">
                        {g.guest_type === "walk_in" ? (
                          <Badge variant="secondary">Walk-in</Badge>
                        ) : (
                          <Badge variant="outline">Pre-registered</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        {g.entry_status === "checked_in" ? (
                          <Badge className="bg-success text-success-foreground">Checked-in</Badge>
                        ) : (
                          <span className="text-muted-foreground whitespace-nowrap">
                            {entryLabel(g.entry_status)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(g.created_at).toLocaleDateString()}
                      </td>
                      <td
                        className={cn(stickyRight, "py-2 text-right space-x-2 whitespace-nowrap")}
                      >
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
                <Select
                  id="page-size"
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
