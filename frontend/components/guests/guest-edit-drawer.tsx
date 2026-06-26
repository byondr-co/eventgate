"use client";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { extractApiError } from "@/lib/api";
import { useFields, type RegistrationField } from "@/lib/events";
import {
  useDeleteGuest,
  useSendQrEmail,
  useUpdateGuest,
  useVoidGuest,
  type Guest,
} from "@/lib/guests";

// Per-field overrides: null = untouched (fall back to guest prop); string = user edited.
type FieldOverrides = {
  full_name: string | null;
  email: string | null;
  phone_or_chat: string | null;
};

const EMPTY_OVERRIDES: FieldOverrides = {
  full_name: null,
  email: null,
  phone_or_chat: null,
};

export function GuestEditDrawer({
  orgSlug,
  eventSlug,
  guest,
  open,
  onClose,
}: {
  orgSlug: string;
  eventSlug: string;
  guest: Guest | null;
  open: boolean;
  onClose: () => void;
}) {
  const update = useUpdateGuest(orgSlug, eventSlug);
  const voidGuest = useVoidGuest(orgSlug, eventSlug);
  const del = useDeleteGuest(orgSlug, eventSlug);
  const sendQr = useSendQrEmail(orgSlug, eventSlug);
  const { data: fieldsData } = useFields(orgSlug, eventSlug);

  // Nullish-override pattern: null = untouched; string = user-typed value.
  const [overrides, setOverrides] = useState<FieldOverrides>(EMPTY_OVERRIDES);
  // Custom field overrides: key → user-typed string; absent key = use guest value.
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});

  if (!guest) return null;

  const customFields = (fieldsData?.results ?? []).filter((f: RegistrationField) => !f.is_preset);

  // Resolve each value: override wins, else guest baseline.
  const fullName = overrides.full_name ?? guest.full_name;
  const email = overrides.email ?? guest.email;
  const phoneOrChat = overrides.phone_or_chat ?? guest.phone_or_chat;
  const set = (patch: Partial<FieldOverrides>) => setOverrides((prev) => ({ ...prev, ...patch }));

  const onSave = async () => {
    // Build custom_fields payload from resolved values.
    const mergedCustom: Record<string, string> = { ...guest.custom_fields };
    for (const key of Object.keys(customOverrides)) {
      mergedCustom[key] = customOverrides[key];
    }
    try {
      await update.mutateAsync({
        guestId: guest.id,
        data: {
          full_name: fullName,
          email,
          phone_or_chat: phoneOrChat,
          custom_fields: mergedCustom,
        },
      });
      toast.success("Guest updated.");
      onClose();
    } catch (err) {
      toast.error(extractApiError(err));
    }
  };

  const onVoid = async () => {
    try {
      await voidGuest.mutateAsync(guest.id);
      toast.success("Guest voided.");
      onClose();
    } catch (err) {
      toast.error(extractApiError(err));
    }
  };

  const onDelete = async () => {
    try {
      await del.mutateAsync(guest.id);
      toast.success("Guest deleted.");
      onClose();
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("409")) {
        toast.error("This guest has activity history and cannot be deleted. Use Void instead.");
      } else {
        toast.error(extractApiError(err));
      }
    }
  };

  const onResend = async () => {
    try {
      await sendQr.mutateAsync(guest.id);
      toast.success("QR email queued.");
    } catch (err) {
      toast.error(extractApiError(err));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="top-0 right-0 left-auto h-full max-w-md translate-x-0 translate-y-0 rounded-none rounded-l-xl">
        <DialogHeader>
          <DialogTitle>Edit guest</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto">
          <Field label="Name" htmlFor="gd-name">
            <Input
              id="gd-name"
              value={fullName}
              onChange={(e) => set({ full_name: e.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor="gd-email">
            <Input
              id="gd-email"
              type="email"
              value={email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          <Field label="Phone / chat" htmlFor="gd-phone">
            <Input
              id="gd-phone"
              value={phoneOrChat}
              onChange={(e) => set({ phone_or_chat: e.target.value })}
            />
          </Field>
          {customFields.map((f: RegistrationField) => {
            const val = customOverrides[f.field_key] ?? guest.custom_fields[f.field_key] ?? "";
            return (
              <Field key={f.field_key} label={f.label_en} htmlFor={`gd-${f.field_key}`}>
                <Input
                  id={`gd-${f.field_key}`}
                  value={val}
                  onChange={(e) =>
                    setCustomOverrides((prev) => ({ ...prev, [f.field_key]: e.target.value }))
                  }
                />
              </Field>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={onSave} disabled={update.isPending}>
            Save
          </Button>
          {guest.guest_type === "pre_registered" && guest.email && (
            <Button variant="outline" onClick={onResend} disabled={sendQr.isPending}>
              Resend QR
            </Button>
          )}
          <ConfirmDialog
            trigger={<Button variant="outline">Void</Button>}
            title="Void this guest?"
            description="Marks them voided and removes them from active counts. Reversible by an admin."
            confirmLabel="Void"
            destructive
            onConfirm={onVoid}
          />
          <ConfirmDialog
            trigger={<Button variant="destructive">Delete</Button>}
            title="Delete this guest?"
            description="Permanent. Only guests with no activity history can be deleted — otherwise void."
            confirmLabel="Delete"
            onConfirm={onDelete}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
