import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

function reqFor(path: string, opts: { authed?: boolean } = {}) {
  const headers = new Headers();
  if (opts.authed) headers.set("cookie", "eventgate_access=token");
  return new NextRequest(new URL(`https://eventgate.byondr.co${path}`), { headers });
}

describe("proxy auth gate", () => {
  it("lets anonymous users through /r/<code> short links (public)", () => {
    const res = proxy(reqFor("/r/1ipPXwYj"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets anonymous users through public /e/ register pages", () => {
    const res = proxy(reqFor("/e/org/event/register"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects anonymous users away from private app routes to /login with next", () => {
    const res = proxy(reqFor("/orgs/acme"));
    const loc = res.headers.get("location");
    expect(loc).toContain("/login");
    expect(loc).toContain("next=%2Forgs%2Facme");
  });

  it("lets authenticated users through a private route", () => {
    const res = proxy(reqFor("/orgs/acme", { authed: true }));
    expect(res.headers.get("location")).toBeNull();
  });
});
