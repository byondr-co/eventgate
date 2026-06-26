"use client";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { exportGuestsCsv, useBulkGuests, type BulkAction, type BulkResult } from "@/lib/guests";
import { notify } from "@/lib/toast";

function summarize(r: BulkResult): string {
  const verb = r.action === "void" ? "Voided" : r.action === "delete" ? "Deleted" : "Queued";
  const skipped = r.skipped.length ? `; skipped ${r.skipped.length}` : "";
  return `${verb} ${r.done}${skipped}.`;
}

export function BulkActionBar({
  orgSlug,
  eventSlug,
  selectedIds,
  onDone,
}: {
  orgSlug: string;
  eventSlug: string;
  selectedIds: string[];
  onDone: () => void;
}) {
  const bulk = useBulkGuests(orgSlug, eventSlug);

  const run = async (action: BulkAction) => {
    try {
      const result = await bulk.mutateAsync({ action, guestIds: selectedIds });
      notify.success(summarize(result));
      onDone();
    } catch (e) {
      notify.error(e);
    }
  };

  const onExportSelected = async () => {
    try {
      await exportGuestsCsv(orgSlug, eventSlug, { ids: selectedIds });
    } catch (e) {
      notify.error(e);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
      <span className="font-medium">{selectedIds.length} selected</span>
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="outline" disabled={bulk.isPending}>
            Void
          </Button>
        }
        title={`Void ${selectedIds.length} guest(s)?`}
        description="Marks them voided and removes them from active counts."
        confirmLabel="Void"
        destructive
        onConfirm={() => run("void")}
      />
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="outline" disabled={bulk.isPending}>
            Resend QR
          </Button>
        }
        title={`Resend QR to ${selectedIds.length} guest(s)?`}
        description="Re-queues the QR email for pre-registered guests with an email."
        confirmLabel="Resend"
        destructive={false}
        onConfirm={() => run("resend_qr")}
      />
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="destructive" disabled={bulk.isPending}>
            Delete
          </Button>
        }
        title={`Delete ${selectedIds.length} guest(s)?`}
        description="Permanently deletes guests with no activity history; others are skipped."
        confirmLabel="Delete"
        onConfirm={() => run("delete")}
      />
      <Button size="sm" variant="outline" onClick={onExportSelected}>
        Export selected
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Clear
      </Button>
    </div>
  );
}
