"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ClaimConfirmation } from "@/components/walkins/claim-confirmation";
import { readClaim, writeClaim } from "@/lib/walkin-device";
import { useClaim } from "@/lib/walkins";

export default function WalkinClaimPage() {
  const { orgSlug, eventSlug, token } = useParams<{
    orgSlug: string;
    eventSlug: string;
    token: string;
  }>();

  // Pre-flight (client-side deterrent): if this device already claimed a
  // DIFFERENT walk-in token for this event, it's a repeat scan of the
  // auto-advancing QR — block it instead of consuming another slot. Re-scanning
  // the SAME token is fine (idempotent) and still shows "Entry confirmed".
  // Computed once at mount via a lazy initializer (readClaim is SSR-safe and
  // returns null on the server), so the claim never fires when blocked.
  const [blocked] = useState(() => {
    const prior = readClaim(orgSlug, eventSlug);
    return !!prior && prior.token !== token;
  });

  const { data, isLoading, isError, error } = useClaim(orgSlug, eventSlug, token, {
    enabled: !blocked,
  });

  // Remember this device's claim so the next (different-token) scan is blocked.
  useEffect(() => {
    if (data) writeClaim(orgSlug, eventSlug, token);
  }, [data, orgSlug, eventSlug, token]);

  if (blocked) {
    return (
      <main className="min-h-screen bg-green-600 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-[6rem] leading-none">✓</div>
          <h1 className="mt-4 text-2xl font-extrabold">Already checked in</h1>
          <p className="mt-4 text-base opacity-90">
            This device has already checked in for this event. Please see a staff member if you need
            help.
          </p>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Checking you in…</p>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="min-h-screen bg-red-600 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-[6rem] leading-none">✕</div>
          <h1 className="mt-4 text-2xl font-extrabold">Could not check in</h1>
          <p className="mt-4 text-base opacity-90">
            {error?.message || "Show this screen to a staff member at the help desk."}
          </p>
        </div>
      </main>
    );
  }

  return <ClaimConfirmation infoFormUrl={data.info_form_url} />;
}
