import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? "staging",
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0, // off by default — scanner pages are short
    replaysOnErrorSampleRate: 0.25, // capture replays on actual errors only
    integrations: [], // keep the bundle tight; no Replay default
  });
}
