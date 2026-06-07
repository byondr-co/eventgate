# Plan N verification checklist

> **Scope:** Pilot reliability plus optional Google Form bridge. Run before the
> 2026-06-12 T-7 gate. If the bridge section does not pass, disable the bridge and
> continue with native Eventgate registration or CSV import.

## Section 0 - Code and deploy state

- [ ] Local main matches remote except intentional Plan N commits.
- [ ] Backend tests pass:

  ```bash
  docker start eventgate-postgres-1 || docker compose up -d postgres
  cd backend && uv run pytest -q
  ```

- [ ] Backend mypy passes:

  ```bash
  cd backend && uv run mypy apps config
  ```

- [ ] Frontend gates pass:

  ```bash
  cd frontend && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check
  ```

- [ ] Production backend health returns 200:

  ```bash
  curl -sS https://api.eventgate.byondr.co/api/health/
  ```

## Section 1 - Ingress paths

- [ ] Native Eventgate public registration creates a guest and sends QR email.
- [ ] CSV import preview works.
- [ ] CSV import commit processes a mixed valid/invalid file and produces the expected counters.
- [ ] Google Form bridge creates a guest from a test Sheet submission.
- [ ] Re-running the same Google Form submission does not create a duplicate guest or send a duplicate QR.
- [ ] Google Form submission with missing required email is rejected and writes an audit row.
- [ ] Disabled Google Form bridge rejects cleanly and creates no guest.

## Section 2 - Door path

- [ ] Device enroll works.
- [ ] PIN unlock works.
- [ ] Scanner cache primes.
- [ ] Pre-registered scan succeeds.
- [ ] Duplicate scan renders the duplicate state.
- [ ] Offline scan queues and replays.
- [ ] Help desk escalation appears in dashboard.

## Section 3 - Walk-in path

- [ ] Walk-in display renders QR.
- [ ] Guest claim succeeds.
- [ ] Info form saves.
- [ ] Capacity boundary blocks at the configured cap.
- [ ] Blocked re-scan reminder points guest to complete information.

## Section 4 - Operational readiness

- [ ] Sentry prod issue intake is confirmed.
- [ ] Fly app, worker, and beat are healthy.
- [ ] Redis is reachable.
- [ ] Telegram CTA/link still works if bot is configured.
- [ ] Printed fallback list is confirmed with Click Cam.
- [ ] Bridge cutoff decision is recorded:
  - Enabled for pilot
  - Disabled for pilot

## Acceptance criteria

- Sections 0, 2, 3, and 4 pass.
- Section 1 passes for native registration and CSV.
- Google Form bridge is enabled only if all Google Form bridge checks pass.
