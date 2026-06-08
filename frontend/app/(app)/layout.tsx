"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { useLogout, useMe } from "@/lib/auth";
import { SessionRefreshProvider } from "@/lib/auth-refresh";

export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
  const router = useRouter();

  return (
    <SessionRefreshProvider>
      <div className="min-h-screen flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50"
        >
          Skip to content
        </a>
        <header className="border-b">
          <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3">
            <Link href="/" className="font-semibold">
              Eventgate
            </Link>
            <div className="flex items-center gap-3 text-sm">
              <ThemeToggle />
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
        <main id="main" tabIndex={-1} className="mx-auto max-w-6xl w-full flex-1 px-6 py-8">
          {children}
        </main>
      </div>
    </SessionRefreshProvider>
  );
}
