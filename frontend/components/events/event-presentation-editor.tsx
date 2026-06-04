"use client";

import { useState } from "react";

import { FileDropZone } from "@/components/common/file-drop-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { extractApiError } from "@/lib/api";
import { useEvent, useUpdateEvent, useUploadBanner } from "@/lib/events";
import { notify } from "@/lib/toast";

const MAX_BANNER_BYTES = 4 * 1024 * 1024; // 4 MB

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

  const value = description ?? event.data?.description ?? "";

  const saveDescription = async () => {
    try {
      await update.mutateAsync({ description: value });
      notify.success("Saved.");
    } catch (e) {
      notify.error(e);
    }
  };

  const validateImage = (file: File): string | null => {
    if (file.size > MAX_BANNER_BYTES) {
      return "Image must be under 4 MB";
    }
    return null;
  };

  const onBannerFile = async (file: File) => {
    // Double-check size here in case FileDropZone validate is bypassed somehow
    if (file.size > MAX_BANNER_BYTES) {
      notify.warning("Image must be under 4 MB");
      return;
    }
    try {
      await uploadBanner.mutateAsync(file);
      notify.success("Banner updated.");
    } catch (err) {
      notify.error(err);
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
          <div className="mt-2">
            <FileDropZone
              accept="image/*"
              label="Drop your banner image here"
              hint="PNG, JPG or WebP — max 4 MB"
              icon="🖼"
              validate={validateImage}
              onFile={onBannerFile}
              disabled={uploadBanner.isPending}
            />
          </div>
        </div>
        <Field label="Description" htmlFor="event-description">
          <Textarea
            id="event-description"
            value={value}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="A short welcome shown under the event name on the registration page."
          />
        </Field>
        <div className="flex items-center gap-3">
          <Button onClick={saveDescription} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save description"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
