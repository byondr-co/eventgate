"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { useGuestsCount } from "@/lib/guests";
import { useOpenTicketsCount } from "@/lib/helpdesk";
import { cn } from "@/lib/utils";

type TabKey =
  | "dashboard"
  | "form"
  | "guests"
  | "links"
  | "devices"
  | "helpdesk"
  | "audit"
  | "settings";

type TabSpec = {
  key: TabKey;
  /** Suffix appended to `/orgs/{org}/events/{event}` — empty string for the Dashboard tab. */
  suffix: string;
  /** Additional pathname suffixes that should also activate this tab. */
  aliases?: string[];
};

const TABS: TabSpec[] = [
  { key: "dashboard", suffix: "" },
  { key: "form", suffix: "/form" },
  { key: "guests", suffix: "/guests", aliases: ["/imports"] },
  { key: "links", suffix: "/links" },
  { key: "devices", suffix: "/devices" },
  { key: "helpdesk", suffix: "/helpdesk" },
  { key: "audit", suffix: "/audit" },
  { key: "settings", suffix: "/settings" },
];

function isTabActive(pathname: string, base: string, spec: TabSpec): boolean {
  if (spec.suffix === "") {
    // Dashboard — exact match only
    return pathname === base;
  }
  const tabPath = `${base}${spec.suffix}`;
  if (pathname === tabPath || pathname.startsWith(`${tabPath}/`)) return true;
  if (spec.aliases) {
    for (const alias of spec.aliases) {
      const aliasPath = `${base}${alias}`;
      if (pathname === aliasPath || pathname.startsWith(`${aliasPath}/`)) return true;
    }
  }
  return false;
}

type Props = { orgSlug: string; eventSlug: string };

export function EventTabsNav({ orgSlug, eventSlug }: Props) {
  const pathname = usePathname() ?? "";
  const t = useTranslations("nav");
  const openTickets = useOpenTicketsCount(orgSlug, eventSlug);
  const guests = useGuestsCount(orgSlug, eventSlug);

  const base = `/orgs/${orgSlug}/events/${eventSlug}`;

  return (
    <nav
      aria-label="Event sections"
      className="flex gap-1 overflow-x-auto border-b [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]"
    >
      {TABS.map((spec) => {
        const href = `${base}${spec.suffix}`;
        const active = isTabActive(pathname, base, spec);
        const label = t(spec.key);

        let badge: number | null = null;
        if (spec.key === "helpdesk") {
          badge =
            typeof openTickets.data === "number" && openTickets.data > 0 ? openTickets.data : null;
        } else if (spec.key === "guests") {
          badge = typeof guests.data === "number" ? guests.data : null;
        }

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
            {badge !== null && (
              <span className="ml-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
