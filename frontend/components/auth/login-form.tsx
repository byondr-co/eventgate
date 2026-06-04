"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRequestMagicLink } from "@/lib/auth";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const request = useRequestMagicLink();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await request.mutateAsync(email);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Didn&apos;t arrive? Check spam, then try again.
          </p>
          <Button
            variant="link"
            className="px-0"
            onClick={() => {
              setSubmitted(false);
              setEmail("");
            }}
          >
            Use a different email
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to Eventgate</CardTitle>
        <CardDescription>Enter your email — we&apos;ll send a one-time link.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" htmlFor="login-email">
            <Input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={request.isPending || !email}>
            {request.isPending ? "Sending…" : "Send sign-in link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
