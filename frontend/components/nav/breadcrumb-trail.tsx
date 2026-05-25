"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEvent } from "@/lib/events";
import { useOrg } from "@/lib/orgs";

type Section = {
  key: "dashboard" | "form" | "guests" | "devices" | "helpdesk" | "audit" | "settings";
  slugs: string[]; // pathname-prefix slugs that map to this section
};

const SECTIONS: Section[] = [
  { key: "form", slugs: ["form"] },
  { key: "guests", slugs: ["guests", "imports"] }, // imports/[id] is a guest-list op
  { key: "devices", slugs: ["devices"] },
  { key: "helpdesk", slugs: ["helpdesk"] },
  { key: "audit", slugs: ["audit"] },
  { key: "settings", slugs: ["settings"] },
];

type Crumb = { label: string; href?: string };

function buildCrumbs(
  pathname: string,
  t: (key: string) => string,
  orgName: string | undefined,
  orgSlug: string | undefined,
  eventName: string | undefined,
  eventSlug: string | undefined,
): Crumb[] {
  const crumbs: Crumb[] = [{ label: t("home"), href: "/" }];
  if (!orgSlug) return crumbs;

  const orgHref = `/orgs/${orgSlug}`;
  const orgLabel = orgName ?? orgSlug;
  const onOrgPage = pathname === orgHref || pathname === `${orgHref}/members`;
  crumbs.push({ label: orgLabel, href: onOrgPage ? undefined : orgHref });
  if (onOrgPage) return crumbs;

  if (!eventSlug) return crumbs;
  const eventHref = `/orgs/${orgSlug}/events/${eventSlug}`;
  const eventLabel = eventName ?? eventSlug;
  const onEventDetail = pathname === eventHref;
  crumbs.push({ label: eventLabel, href: onEventDetail ? undefined : eventHref });
  if (onEventDetail) return crumbs;

  // Detect sub-route from the URL segment after the event slug
  const after = pathname.slice(eventHref.length + 1); // e.g. "devices" or "imports/abc-123"
  const firstSeg = after.split("/")[0];
  const matched = SECTIONS.find((s) => s.slugs.includes(firstSeg));
  if (matched) crumbs.push({ label: t(matched.key) });
  return crumbs;
}

export function BreadcrumbTrail() {
  const pathname = usePathname() ?? "/";
  const t = useTranslations("nav");

  // Parse the path to extract org and event slugs
  const orgMatch = pathname.match(/^\/orgs\/([a-z0-9-]+)/);
  const eventMatch = pathname.match(/^\/orgs\/[a-z0-9-]+\/events\/([a-z0-9-]+)/);
  const orgSlug = orgMatch?.[1];
  const eventSlug = eventMatch?.[1];

  const org = useOrg(orgSlug ?? "");
  const event = useEvent(orgSlug ?? "", eventSlug ?? "");

  const crumbs = buildCrumbs(pathname, t, org.data?.name, orgSlug, event.data?.name, eventSlug);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={i}>
              <BreadcrumbItem>
                {last || !c.href ? (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={c.href} />}>{c.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
