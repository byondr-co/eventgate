import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Django enforces trailing slashes via APPEND_SLASH=True. Preserve them
  // through Next.js routing AND the /api/* rewrite so requests don't bounce
  // between Vercel and Django redirecting each other.
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  // Proxy /api/* to the Django backend so authenticated requests are same-origin
  // (cookies set by the backend bind to this Vercel domain, not fly.dev).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
