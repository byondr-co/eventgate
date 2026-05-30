"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { CopyButton } from "@/components/events/copy-button";
import { useEventShortUrl } from "@/lib/short-urls";

type Props = { orgSlug: string; eventSlug: string };

export function PublicUrlCard({ orgSlug, eventSlug }: Props) {
  const shortUrl = useEventShortUrl(orgSlug, eventSlug);

  const baseOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = `${baseOrigin}/e/${orgSlug}/${eventSlug}/register`;
  const shortFullUrl = shortUrl.data ? `${baseOrigin}/r/${shortUrl.data.short_code}` : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public registration link</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-muted-foreground w-12">Long</span>
            <code className="flex-1 text-sm font-mono break-all">{fullUrl}</code>
            <CopyButton text={fullUrl} />
          </div>
          {shortFullUrl && (
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase text-muted-foreground w-12">Short</span>
              <code className="flex-1 text-sm font-mono break-all">{shortFullUrl}</code>
              <CopyButton text={shortFullUrl} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Share either URL with attendees. The short URL redirects to the full one.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
