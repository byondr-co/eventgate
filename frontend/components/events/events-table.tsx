"use client";

import Link from "next/link";
import { useState } from "react";

import type { VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useEvents, type EventStatus } from "@/lib/events";
import { NoEvents } from "@/lib/illustrations";

type BadgeVariant = NonNullable<
  VariantProps<typeof import("@/components/ui/badge").badgeVariants>["variant"]
>;

export function eventStatusVariant(status: EventStatus): BadgeVariant {
  switch (status) {
    case "draft":
      return "outline";
    case "open":
      return "secondary";
    case "live":
      return "default";
    case "closed":
      return "destructive";
    case "archived":
      return "ghost";
    default:
      return "outline";
  }
}

const PAGE_SIZES = [25, 50, 100];
const PAGE_SIZE_KEY = "events.pageSize";

function loadPageSize(): number {
  if (typeof window === "undefined") return PAGE_SIZES[0];
  const saved = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
  return PAGE_SIZES.includes(saved) ? saved : PAGE_SIZES[0];
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "live", label: "Live" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
] as const satisfies { value: string; label: string }[];

export function EventsTable({ orgSlug }: { orgSlug: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [ordering, setOrdering] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);

  // Status is a client-side filter over the page (backend has no ?status= param);
  // search/ordering/pagination are server-driven.
  const { data, isLoading } = useEvents(orgSlug, { search, ordering, page, pageSize });
  const all = data?.results ?? [];
  const events = status ? all.filter((e) => e.status === status) : all;
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const onSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };
  const onPageSize = (v: number) => {
    setPageSize(v);
    setPage(1);
    if (typeof window !== "undefined") window.localStorage.setItem(PAGE_SIZE_KEY, String(v));
  };
  const toggleSort = (field: string) => {
    setOrdering((o) => (o === field ? `-${field}` : field));
    setPage(1);
  };
  // Active sort column + direction, derived from `ordering` ("-" prefix = descending).
  const sortField = ordering.replace(/^-/, "");
  const sortDir: "ascending" | "descending" = ordering.startsWith("-") ? "descending" : "ascending";
  const ariaSort = (field: string) => (sortField === field ? sortDir : "none");
  const sortCaret = (field: string) =>
    sortField === field ? (
      <span aria-hidden="true" className="ml-1">
        {sortDir === "ascending" ? "↑" : "↓"}
      </span>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Events
          <Link
            href={`/orgs/${orgSlug}/events/new`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            New event
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search events…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="max-w-xs"
          />
          <SegmentedControl
            aria-label="Filter by status"
            options={STATUS_FILTERS}
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        </div>
        {isLoading && <TableSkeleton />}
        {!isLoading && events.length === 0 && (
          <EmptyState
            illustration={NoEvents}
            title="No events"
            message="Adjust your search or create an event."
          />
        )}
        {events.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-left font-normal" aria-sort={ariaSort("name")}>
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => toggleSort("name")}
                  >
                    Name
                    {sortCaret("name")}
                  </button>
                </th>
                <th className="py-2 text-left font-normal" aria-sort={ariaSort("starts_at")}>
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => toggleSort("starts_at")}
                  >
                    Date
                    {sortCaret("starts_at")}
                  </button>
                </th>
                <th className="py-2 text-left font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-2">
                    <Link href={`/orgs/${orgSlug}/events/${e.slug}`} className="hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {e.starts_at ? new Date(e.starts_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">
                    <Badge variant={eventStatusVariant(e.status)}>{e.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <label htmlFor="ev-page-size" className="text-muted-foreground">
              Rows per page
            </label>
            <Select
              id="ev-page-size"
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
  );
}
