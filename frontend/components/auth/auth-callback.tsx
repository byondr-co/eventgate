"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConsumeMagicLink } from "@/lib/auth";

type State = { kind: "consuming" } | { kind: "ok" } | { kind: "error"; message: string };

export function AuthCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const consume = useConsumeMagicLink();
  const token = params.get("token");
  const next = params.get("next") || "/";
  const [state, setState] = useState<State>(
    token ? { kind: "consuming" } : { kind: "error", message: "Missing token in URL." },
  );
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    consume
      .mutateAsync(token)
      .then(() => {
        setState({ kind: "ok" });
        router.replace(next);
      })
      .catch((err: Error) => setState({ kind: "error", message: err.message }));
  }, [token, next, router, consume]);

  if (state.kind === "consuming") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signing you in…</CardTitle>
          <CardDescription>One moment.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (state.kind === "ok") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signed in</CardTitle>
          <CardDescription>Redirecting…</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in link invalid</CardTitle>
        <CardDescription>{state.message}</CardDescription>
      </CardHeader>
      <CardContent>
        <a className="text-sm underline" href="/login">
          Request a new link
        </a>
      </CardContent>
    </Card>
  );
}
