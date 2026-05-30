import type { ReactNode } from "react";

import { BreadcrumbTrail } from "@/components/nav/breadcrumb-trail";
import { OrgTabsNav } from "@/components/nav/org-tabs-nav";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function OrgLayout({ children, params }: Props) {
  const { slug } = await params;
  return (
    <div className="space-y-4">
      <BreadcrumbTrail />
      <OrgTabsNav orgSlug={slug} />
      {children}
    </div>
  );
}
