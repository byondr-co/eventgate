"use client";

import { useParams } from "next/navigation";
import { Fragment, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuditEvents, type AuditResult } from "@/lib/audit";

const PREFIXES = [
  { value: "all", label: "All" },
  { value: "checkin.", label: "Check-ins" },
  { value: "walkin.", label: "Walk-ins" },
  { value: "helpdesk.", label: "Help desk" },
];

export function resultClasses(result: AuditResult): string {
  if (result === "success") return "bg-success text-success-foreground";
  if (result === "warning") return "bg-warning text-warning-foreground";
  return "bg-destructive text-destructive-foreground";
}

export default function AuditPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const [prefix, setPrefix] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data, isLoading } = useAuditEvents(slug, eventSlug, prefix);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <div className="flex gap-1">
          {PREFIXES.map((p) => (
            <Button
              key={p.value}
              variant={prefix === p.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPrefix(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading ? "Loading…" : `${data?.count ?? 0} rows`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="w-6 py-2 pr-1" aria-label="Expand"></th>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 pr-3">Actor</th>
                <th className="py-2 pr-3">Token</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results ?? []).map((row) => {
                const isOpen = expanded.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr className="border-b text-xs">
                      <td className="py-2 pr-1">
                        <button
                          type="button"
                          aria-label={isOpen ? "Collapse details" : "Expand details"}
                          aria-expanded={isOpen}
                          onClick={() => toggleExpand(row.id)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                        >
                          {isOpen ? "▾" : "▸"}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {new Date(row.occurred_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 font-mono">{row.action}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${resultClasses(row.result)}`}
                        >
                          {row.result}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {row.actor_type}:{row.actor_id.slice(0, 8)}
                      </td>
                      <td className="py-2 pr-3 font-mono">{row.entry_token.slice(0, 16)}</td>
                      <td className="py-2 font-mono">
                        {row.previous_status} → {row.new_status}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b bg-muted/30">
                        <td></td>
                        <td colSpan={6} className="py-2 pr-3">
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-[0.7rem] font-mono">
                            {JSON.stringify(row.details_json, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
