"use client";

import { useParams } from "next/navigation";

import { ClaimConfirmation } from "@/components/walkins/claim-confirmation";
import { useClaim } from "@/lib/walkins";

export default function WalkinClaimPage() {
  const { orgSlug, eventSlug, token } = useParams<{
    orgSlug: string;
    eventSlug: string;
    token: string;
  }>();
  const { data, isLoading, isError, error } = useClaim(orgSlug, eventSlug, token);

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
