"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useLogout, useMe } from "@/lib/auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3">
          <Link href="/" className="font-semibold">
            Eventgate
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{me.data?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout.mutateAsync();
                router.replace("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl w-full flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
