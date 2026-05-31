"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractApiError } from "@/lib/api";
import { useEvent, useUpdateEvent, useUploadBanner } from "@/lib/events";

export function EventPresentationEditor({
  orgSlug,
  eventSlug,
}: {
  orgSlug: string;
  eventSlug: string;
}) {
  const event = useEvent(orgSlug, eventSlug);
  const update = useUpdateEvent(orgSlug, eventSlug);
  const uploadBanner = useUploadBanner(orgSlug, eventSlug);
  const [description, setDescription] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const value = description ?? event.data?.description ?? "";

  const saveDescription = async () => {
    setNotice(null);
    try {
      await update.mutateAsync({ description: value });
      setNotice("Saved.");
    } catch (e) {
      setNotice(extractApiError(e));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNotice(null);
    try {
      await uploadBanner.mutateAsync(file);
      setNotice("Banner uploaded.");
    } catch (err) {
      setNotice(extractApiError(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration page</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <span className="text-sm font-medium">Banner image</span>
          {event.data?.banner_image && (
            <img
              src={event.data.banner_image}
              alt="Current banner"
              className="mt-2 h-24 w-full rounded-md object-cover"
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            disabled={uploadBanner.isPending}
            className="mt-2 block text-sm"
          />
        </div>
        <label className="block">
          <span className="text-sm font-medium">Description</span>
          <textarea
            value={value}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="A short welcome shown under the event name on the registration page."
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={saveDescription} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save description"}
          </Button>
          {notice && <span className="text-sm text-muted-foreground">{notice}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
