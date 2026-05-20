"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/lib/auth";
import { useAcceptInvite } from "@/lib/orgs";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const me = useMe();
  const accept = useAcceptInvite();
  const router = useRouter();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    if (me.isLoading) return;
    if (!me.data) {
      router.replace(`/login?next=/invites/${token}`);
      return;
    }
    ran.current = true;
    accept
      .mutateAsync(token)
      .then(({ organization }) => router.replace(`/orgs/${organization.slug}`))
      .catch((err: Error) => setError(err.message));
  }, [me.data, me.isLoading, token, accept, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accepting invite</CardTitle>
        <CardDescription>{error ?? "One moment…"}</CardDescription>
      </CardHeader>
      {error && (
        <CardContent>
          <Link href="/" className="text-sm underline">
            Back home
          </Link>
        </CardContent>
      )}
    </Card>
  );
}
