import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/debug/health"];
const INVITE_PREFIX = "/invites/";
const SCANNER_PREFIX = "/scanner/";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /scanner/* uses device + session tokens (Authorization header), NOT the
  // user JWT cookie. Skip the auth-redirect for it.
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith(INVITE_PREFIX) ||
    pathname.startsWith("/e/") ||
    pathname.startsWith(SCANNER_PREFIX);

  const hasAccess = req.cookies.get("eventgate_access");
  if (!hasAccess && !isPublic) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (hasAccess && pathname === "/login") {
    const home = req.nextUrl.clone();
    home.pathname = "/";
    return NextResponse.redirect(home);
  }
  return NextResponse.next();
}

export const config = {
  // Skip _next, api (rewritten to Django), favicon, and any path with a dot
  // (static assets like /file.svg, qr.png, etc.).
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};
