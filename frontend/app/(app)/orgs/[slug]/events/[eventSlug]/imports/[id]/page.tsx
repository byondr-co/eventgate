"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useImportStatus } from "@/lib/csv-imports";

export default function ImportDetailPage() {
  const { slug, eventSlug, id } = useParams<{
    slug: string;
    eventSlug: string;
    id: string;
  }>();
  const { data, isLoading } = useImportStatus(slug, eventSlug, id);
  const qc = useQueryClient();

  useEffect(() => {
    if (data?.status === "complete" || data?.status === "failed") {
      void qc.invalidateQueries({ queryKey: ["guests", slug, eventSlug] });
    }
  }, [data?.status, qc, slug, eventSlug]);

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const pct =
    data.total_rows > 0
      ? Math.round(((data.imported_rows + data.failed_rows) / data.total_rows) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Import {data.id.slice(0, 8)}</h1>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/orgs/${slug}/events/${eventSlug}/guests`}>Back to guests</Link>}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base capitalize">{data.status}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
              aria-label={`${pct}%`}
            />
          </div>
          <p>
            Imported {data.imported_rows} / {data.total_rows}. {data.failed_rows} failed.
          </p>
          {data.status === "complete" && data.error_report_url && (
            <p>
              <a href={data.error_report_url} className="text-primary underline" download>
                Download error report
              </a>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
