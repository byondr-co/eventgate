"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { extractApiError } from "@/lib/api";
import { useDeleteEvent } from "@/lib/events";
import { useGuestsCount } from "@/lib/guests";

export function EventDangerZone({ orgSlug, eventSlug }: { orgSlug: string; eventSlug: string }) {
  const { data: guestCount } = useGuestsCount(orgSlug, eventSlug);
  const del = useDeleteEvent(orgSlug);
  const router = useRouter();
  const hasGuests = (guestCount ?? 0) > 0;

  const onDelete = async () => {
    try {
      await del.mutateAsync(eventSlug);
      toast.success("Event deleted.");
      router.replace(`/orgs/${orgSlug}`);
    } catch (err) {
      toast.error(extractApiError(err));
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-destructive/40 p-4">
      <h2 className="font-medium text-destructive">Danger zone</h2>
      {hasGuests ? (
        <>
          <Button variant="destructive" disabled aria-disabled>
            Delete event
          </Button>
          <p className="text-sm text-muted-foreground">
            Archive it instead — events with guests can&apos;t be deleted.
          </p>
        </>
      ) : (
        <>
          <ConfirmDialog
            trigger={<Button variant="destructive">Delete event</Button>}
            title="Delete this event?"
            description="This permanently deletes the event. It can't be undone."
            confirmLabel="Delete event"
            onConfirm={onDelete}
          />
          <p className="text-sm text-muted-foreground">
            Only events with no guests and no activity history can be deleted; otherwise archive.
          </p>
        </>
      )}
    </div>
  );
}
