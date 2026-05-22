# Plan G verification checklist

> **Time budget:** ~45 min. Section 0 (~5 min) is pre-flight. Section 1 (~10 min) is backend smoke. Sections 2–3 (~20 min) are the headline UI flows. Section 4 (~10 min) is regression smoke.

## Section 0 — Pre-flight

- [ ] **Local main matches origin/main**

  ```bash
  cd /Users/vinei/Projects/eventgate
  git fetch origin --quiet
  git log --oneline main..origin/main
  ```

  Expect: empty output (no incoming commits).

- [ ] **Backend tests pass**

  ```bash
  docker compose up -d
  cd backend && uv run pytest -q
  ```

  Expect: all tests pass.

- [ ] **Frontend gates pass**

  ```bash
  cd frontend && pnpm install --frozen-lockfile && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check
  ```

  Expect: tests pass, no type errors, no lint warnings, no format issues.

- [ ] **Telegram env vars present (staging / pilot env only — local dev can skip)**
  - `TELEGRAM_BOT_TOKEN` (fly secret) — the bot's API token.
  - `TELEGRAM_BOT_USERNAME` (fly secret + frontend `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`) — the bot's @handle minus the @.
  - `TELEGRAM_WEBHOOK_SECRET` (fly secret) — random ≥32-char string.
  - `TELEGRAM_WEBHOOK_URL` (fly secret) — `https://eventgate-backend-staging.fly.dev/api/v1/telegram/webhook/`.

## Section 1 — Backend smoke

- [ ] **Login as the org owner** and capture the `eventgate_access` cookie value as `$ACCESS_COOKIE` (see Plan F verification checklist for the procedure).

> ⚠️ JWT access tokens TTL = 15 minutes. Re-capture mid-run if a curl returns 401.

- [ ] **CSV preview endpoint accepts a small file**

  ```bash
  printf "Name,Email\nAlice,alice@example.com\n" > /tmp/sample.csv
  curl -sS -X POST \
    "https://<staging>/api/v1/orgs/<slug>/events/<event-slug>/imports/preview/" \
    -H "Cookie: eventgate_access=$ACCESS_COOKIE" \
    -F "file=@/tmp/sample.csv" | python3 -m json.tool
  ```

  Expect: 200; response contains `preview_id`, `auto_mapping = {"0": "name", "1": "email"}`, `registration_fields` list.

- [ ] **CSV preview rejects empty file** (expect 400):

  ```bash
  printf "" > /tmp/empty.csv
  curl -sS -X POST -w "\n%{http_code}\n" \
    "https://<staging>/api/v1/orgs/<slug>/events/<event-slug>/imports/preview/" \
    -H "Cookie: eventgate_access=$ACCESS_COOKIE" \
    -F "file=@/tmp/empty.csv"
  ```

- [ ] **Telegram webhook rejects wrong secret** (expect 200 + no-op):

  ```bash
  curl -sS -X POST -w "\n%{http_code}\n" \
    "https://<staging>/api/v1/telegram/webhook/" \
    -H "X-Telegram-Bot-Api-Secret-Token: wrong" \
    -H "Content-Type: application/json" \
    --data '{"update_id":1,"message":{"chat":{"id":42},"text":"/start nope","from":{"username":"x"}}}'
  ```

  Expect: `200`. Then check the staging logs — no warnings beyond `telegram_webhook: secret mismatch`; no `TelegramBinding` row created.

## Section 2 — Telegram bot end-to-end

> Requires a real test bot in the staging env, with `TELEGRAM_BOT_USERNAME=EventgateStagingBot` (or similar) set.

- [ ] **Register a guest** via the public registration page (`/e/<org-slug>/<event-slug>/register`). On submit, the page should redirect to `/e/<org-slug>/<event-slug>/registered/<guest-id>?token=<entry_token>`.

- [ ] **Confirmation page shows the "Get on Telegram" CTA.** The CTA's href should be `https://t.me/<bot_username>?start=<entry_token>`. (If the CTA is absent, check `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is baked into the Vercel build; if the href has no `?start=...`, the `?token=...` query param is missing from the URL.)

- [ ] **Tap "Get on Telegram"** → Telegram opens → bot greets → QR PNG arrives within ~5 seconds.

- [ ] **Verify the binding + audit rows:**

  ```bash
  curl -sS \
    "https://<staging>/api/v1/orgs/<slug>/events/<event-slug>/audit/?action_prefix=notifications." \
    -H "Cookie: eventgate_access=$ACCESS_COOKIE" | python3 -m json.tool | head -40
  ```

  Expect: `notifications.telegram_bound` audit row + `notifications.telegram_sent` audit row.

- [ ] **Send any other message to the bot** (e.g., "hi") → bot replies with the generic message ("Hi! To receive your QR code…").

- [ ] **Send `/start <invalid_token>`** to the bot → bot replies with the "no longer valid" message. Verify a `notifications.telegram_unknown_start` audit row exists.

- [ ] **Rebound flow** (optional): create a second guest in the same event, send `/start <guest2_token>` from the SAME Telegram chat used for the first bind. Verify the binding now points to guest2, the old binding for guest1 is gone, and an audit row `notifications.telegram_rebound` is emitted.

## Section 3 — CSV import end-to-end

- [ ] **Open** `/orgs/<slug>/events/<event-slug>/guests`. Click "Import CSV".

- [ ] **Upload a 5-row mixed CSV** (3 valid, 2 invalid — e.g., one row with missing name, one with bad email format):

  ```csv
  Name,Email,Phone
  Alice,alice@x.com,+1
  Bob,bob@x.com,+2
  ,charlie@x.com,+3
  Diane,not-an-email,+4
  Eve,eve@x.com,+5
  ```

- [ ] **Preview correctly auto-maps** Name, Email, Phone with "(auto)" badges in the column dropdowns. Click Import.

- [ ] **Status page** (`/orgs/<slug>/events/<event-slug>/imports/<id>`) shows progress, then `Imported 3 / 5. 2 failed.`. Download the error report — verify rows 4 and 5 (1-indexed excluding header) appear with the right error messages (missing name + invalid email).

- [ ] **Audit log** at `/orgs/<slug>/events/<event-slug>/audit?action_prefix=guest.` shows 3 × `guest.created_via_csv` rows.

- [ ] **Re-upload the same file** — preview succeeds, but on commit each previously-imported row gets flagged as "Duplicate: email already registered for this event" in the new error report.

## Section 4 — Regression smoke

- [ ] **Existing Plan F flows still work:** helpdesk inbox loads (`/orgs/<slug>/events/<event-slug>/helpdesk`); audit page expandable rows still toggle; dashboard polling widget still updates.

- [ ] **Email QR still arrives** for a registered guest. When `TELEGRAM_BOT_USERNAME` is set, the email now also contains the Telegram CTA link with `?start=<entry_token>`.

- [ ] **Pre-commit hook** catches a deliberate format violation (Task 0b's hook still works post-Plan-G).

## Acceptance criteria

- All Section 0–3 boxes ticked.
- No new Sentry errors during the Section 2 / 3 walkthroughs.
- The `notifications.telegram_*` audit prefix and `guest.created_via_csv` audit action both appear in the audit viewer.
