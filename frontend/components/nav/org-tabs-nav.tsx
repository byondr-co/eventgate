"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type TabKey = "events" | "members";

type TabSpec = { key: TabKey; suffix: string };

const TABS: TabSpec[] = [
  { key: "events", suffix: "/events" },
  { key: "members", suffix: "/members" },
];

type Props = { orgSlug: string };

export function OrgTabsNav({ orgSlug }: Props) {
  const pathname = usePathname() ?? "";
  const t = useTranslations("nav");

  // Hide when inside an event subtree (event layout owns nav from there)
  if (/^\/orgs\/[a-z0-9-]+\/events\/[a-z0-9-]+/.test(pathname)) return null;

  const base = `/orgs/${orgSlug}`;

  return (
    <nav
      aria-label="Organization sections"
      className="flex gap-1 overflow-x-auto border-b [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]"
    >
      {TABS.map((spec) => {
        const href = `${base}${spec.suffix}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const label = t(spec.key);
        return (
          <Link
            key={spec.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 px-3 py-2 text-sm rounded-t-md border border-transparent border-b-0 whitespace-nowrap",
              active
                ? "bg-background text-foreground font-semibold border-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
