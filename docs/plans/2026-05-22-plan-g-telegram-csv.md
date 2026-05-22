# Plan G — Telegram bot integration + CSV guest import

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Per-task worktree pattern from Plans E/F: each task → `Agent` tool with `isolation: "worktree"` + relative paths only in prompts; spec + quality review subagents after each implementer; merge agent's branch into `main` via rebase + ff-only. Independent tasks dispatched in parallel waves where they touch disjoint files.

**Goal:** Ship the W12 sprint — guest-facing Telegram bot for QR delivery (single global bot, deep-linked per guest) and admin-facing CSV guest import (event-scoped, smart inference + manual override) — so the platform meets brief §3 (notifications) and decisions 3 + 12 ahead of the W13–14 pilot QA.

**Architecture:**

- **Telegram lives in `apps/notifications/`.** Single global bot `@<bot_username>` (token in env), receives updates via webhook to `POST /api/v1/telegram/webhook/`. A new `TelegramBinding(guest, chat_id, username)` model joins a Telegram chat to a Guest row. Only `/start <guest_token>` is handled — anything else gets a generic reply. Outbound QR delivery is a Celery task `send_qr_telegram(guest_id)` enqueued on successful `/start` binding. Failure path: 3 Celery retries with `Retry-After` backoff, then enqueue `send_qr_email` fallback + emit `notifications.telegram_failed` audit.
- **CSV lives in `apps/guests/`.** A new `CsvImport(event, uploaded_by, file, column_mapping, status, counters, error_report)` model tracks each import job. Upload UI nests under event detail (`/orgs/<slug>/events/<eventSlug>/guests` → "Import CSV" button). Server parses headers + first 5 rows for a preview; auto-detects only Name / Email / Phone via header-alias matching; user manually maps everything else (or skips) against the event's `RegistrationField` definitions. The actual import runs in Celery task `process_csv_import(import_id)` with partial-import semantics — each row processed independently, failures land in a downloadable error report, valid rows insert with `source='csv_import'` + emit `guest.created_via_csv` audit row referencing the import id.
- **Two independent subsystems, one plan.** No shared code beyond the existing Celery + audit infrastructure. The two halves implement in parallel waves where file overlap allows.
- **No new auth surface.** Telegram reuses `guest_token` (already the QR check-in secret) as the identity-binding artifact. CSV uses the existing org/event permission system + `IsOrgMember` permission.
- **No real-time/SSE channel.** CSV import status polls every 2s via TanStack Query. Telegram outbound is fire-and-forget Celery; delivery confirmation lives in audit rows, not surfaced in UI for Phase 1.

**Tech Stack:** Django 5 + DRF, Postgres (Neon), Celery + Redis, `segno` for QR rendering, `python-telegram-bot` library, Next.js 16 + React 19 + TanStack Query + Tailwind v4 + shadcn/ui, pytest + Vitest, Fly + Vercel.

---

## Scope summary (locked at brainstorming)

**Telegram — 3 decisions:**

1. **Identity binding:** per-guest deep link `https://t.me/<bot_username>?start=<guest_token>`. Bot resolves `guest_token` to a Guest row and upserts `TelegramBinding(chat_id, username)`. Trust model = the `guest_token` (same secret as the QR).
2. **Bot scope:** minimal — `/start <guest_token>` only. No `/status`, no `/qr`, no free-text routing. Any other message gets a generic reply pointing back to the registration confirmation page. Future commands deferred to Phase 2+.
3. **Transport:** webhook (`POST /api/v1/telegram/webhook/`). Webhook URL registered with Telegram on each deploy via `manage.py setup_telegram_webhook` invoked from fly `release_command`. Signed via Telegram's `secret_token` header (matched against `TELEGRAM_WEBHOOK_SECRET` env).

**CSV — 3 decisions:**

4. **Placement:** nested under event detail at `/orgs/<slug>/events/<eventSlug>/guests` — single CSV imports into the event the user is already viewing.
5. **Error handling:** partial import + per-row error report. Valid rows insert; invalid rows land in a downloadable error CSV. UI shows `"Imported X / Y. Z failed — download report."`
6. **Column mapping:** auto-detect built-in fields only (Name / Email / Phone via header-alias matching). Every other column gets a manual dropdown (Skip + each event `RegistrationField`).

---

## Headline tasks (decomposed by `writing-plans` in the next pass)

Anticipated shape — ~12 tasks total. Final list locked when `writing-plans` runs.

**Backend (~8):**

1. `TelegramBinding` model + migration
2. `setup_telegram_webhook` management command + fly `release_command` wiring
3. `POST /api/v1/telegram/webhook/` view (signature verify + `/start` routing + idempotent binding)
4. `send_qr_telegram(guest_id)` Celery task (render via `segno` + `sendPhoto` + retry/fallback)
5. `CsvImport` model + migration
6. `POST .../imports/preview/` endpoint (multipart upload + parse + auto-detect)
7. `POST .../imports/` endpoint (accept mapping + enqueue task)
8. `process_csv_import(import_id)` Celery task + `GET .../imports/<id>/` status endpoint

**Frontend (~3):**

9. CSV upload dialog with preview table + column-mapping dropdowns (on `/orgs/<slug>/events/<eventSlug>/guests`)
10. Import status / detail view with polling progress + error-report download
11. "Get on Telegram" CTA on registration confirmation page (server-rendered) + email template

**Manual / docs (~1):**

12. Verification checklist + manual smoke (small mixed-valid/invalid CSV; real test bot in dev env)

Backend tasks follow TDD (red → green → commit). Frontend tasks built inline. Each commit is a single-line conventional-commit subject — **no body, no `Co-Authored-By` trailer.**

---

## Suggested execution waves

The controller picks ordering at execution time; this is a hint, not a contract.

| Wave | Tasks | Reasoning |
|---|---|---|
| A (parallel) | 1, 5 | Two new models, disjoint files (`apps/notifications/` vs `apps/guests/`). |
| B (depends on 1, parallel) | 2, 3, 4 | All Telegram-side. Disjoint files within `apps/notifications/`. |
| C (depends on 5, parallel) | 6, 7, 8 | All CSV-side. 6/7 are sibling endpoints; 8 is the task + status endpoint. |
| D (depends on 7, parallel) | 9, 10 | Frontend needs the CSV endpoints. Disjoint UI files. |
| E (depends on 3, 4) | 11 | Registration confirmation page CTA — only safe to land once the bot is deployed + binding works end-to-end. |
| F (sequential after E) | 12 | Verification doc runs last. |

---

## Pre-flight

Confirm baseline matches Plan G Task 0 wave landed:

```bash
cd /Users/vinei/Projects/eventgate
git pull
git log --oneline | head -3
# Expect: 1162a8e chore(frontend): exclude pnpm-lock.yaml from prettier check (or newer)

docker compose up -d
cd backend && uv run pytest -q
# Expect: 219 passed

cd ../frontend && pnpm install --frozen-lockfile && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check
# Expect: all green
```

If any fail, stop and diagnose before kicking off Plan G.

---

## Data model

### `TelegramBinding` (`apps/notifications/models.py`)

```python
class TelegramBinding(OrgScopedModel):
    guest = models.OneToOneField(
        Guest, on_delete=models.CASCADE, related_name="telegram_binding"
    )
    chat_id = models.BigIntegerField(unique=True)  # Telegram chat_id fits in 2^53
    username = models.CharField(max_length=64, blank=True)  # @handle for display; may be empty
    bound_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["chat_id"])]
```

`OrgScopedModel` supplies `org_id`. The binding's `org_id` derives from `guest.event.org_id` (set in `save()` or via signal).

### `CsvImport` (`apps/guests/models.py`)

```python
class CsvImport(OrgScopedModel):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="csv_imports")
    uploaded_by = models.ForeignKey(User, on_delete=models.PROTECT)
    file = models.FileField(upload_to="csv_imports/%Y/%m/%d/")
    column_mapping = models.JSONField(default=dict)
    # keys = column indices (0-based strings); values = "name" | "email" | "phone" | RegistrationField uuid | null (skip)
    status = models.CharField(
        max_length=16,
        choices=[("pending", "Pending"), ("running", "Running"), ("complete", "Complete"), ("failed", "Failed")],
        default="pending",
    )
    total_rows = models.IntegerField(default=0)
    imported_rows = models.IntegerField(default=0)
    failed_rows = models.IntegerField(default=0)
    error_report = models.FileField(upload_to="csv_imports/errors/%Y/%m/%d/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
```

`org_id` derives from `event.org_id`. Traceability from a Guest row back to its import: the `guest.created_via_csv` audit row carries `csv_import_id` in `details_json` — no additional FK on `Guest`.

---

## Telegram flows

### Flow T1 — Guest registration → QR via Telegram (happy path)

1. Guest submits the registration form on `/(public)/e/<orgSlug>/<eventSlug>/register`.
2. Backend creates `Guest` row with `guest_token`. The existing `send_qr_email(guest_id)` task is enqueued in parallel (unchanged from prior plans).
3. Server-rendered confirmation page shows two CTAs:
   - "Open QR" — existing self-serve link (unchanged).
   - "Get on Telegram" — `https://t.me/<bot_username>?start=<guest_token>` (new). The `<bot_username>` is exposed to the frontend via a config endpoint (`GET /api/v1/config/`) so we don't need to bake it into the build.
4. Guest taps "Get on Telegram" → Telegram app opens → bot greets → Telegram POSTs the `/start <guest_token>` update to the webhook.
5. `POST /api/v1/telegram/webhook/` handler:
   1. Verify `X-Telegram-Bot-Api-Secret-Token` header matches `TELEGRAM_WEBHOOK_SECRET` env. On mismatch: 200 + no-op + structured log warning.
   2. Parse update → extract `message.text`, `chat.id`, `from.username`.
   3. If text starts with `/start `: extract token. Look up `Guest` by `guest_token`.
   4. If Guest found and no existing binding for this `chat_id`: create `TelegramBinding(guest, chat_id, username)`. Emit `notifications.telegram_bound` audit.
   5. If Guest found and an existing binding for this `chat_id` points to a DIFFERENT Guest (e.g., the same Telegram user registering on behalf of someone else): replace — update the binding to the new guest. Emit `notifications.telegram_rebound` audit.
   6. If Guest found and binding already matches: no-op binding-wise; still proceed to step 6.
   7. Always enqueue `send_qr_telegram(guest_id)`.
6. Celery task `send_qr_telegram(guest_id)`:
   1. Load Guest + `TelegramBinding`.
   2. Render QR PNG via `segno` (in-memory, ~5 KB).
   3. POST to Telegram `sendPhoto` with `chat_id`, PNG, caption `"Your QR code for <event_name>. Show this at the gate."`.
   4. On success: emit `notifications.telegram_sent` audit.
   5. On Telegram `429 Too Many Requests`: retry with `Retry-After` backoff (max 3 attempts).
   6. On final failure: emit `notifications.telegram_failed` audit + enqueue `send_qr_email(guest_id)` fallback (if not already sent successfully).
7. **Webhook handler ALWAYS returns 200** — even on internal error — to prevent Telegram retry-flooding. Internal errors get logged + audit-emitted; they don't surface as non-200 to Telegram.

### Flow T2 — Unknown / invalid `/start` token

- Step 5.3 lookup fails (token doesn't exist).
- Bot replies via `sendMessage`: `"Sorry, this link is no longer valid. Please contact your event organizer."`
- Emit `notifications.telegram_unknown_start` audit (records `chat_id` + redacted token prefix).

### Flow T3 — Any other message

- Generic reply: `"Hi! To receive your QR code, please use the 'Get on Telegram' button on your event registration confirmation page."`
- No audit row (avoids noise from random pokes).

### Deployment

- `fly.toml` `release_command` invokes `cd backend && uv run python manage.py setup_telegram_webhook`.
- Command: POST `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook` with `url=https://<app>.fly.dev/api/v1/telegram/webhook/` and `secret_token=<TELEGRAM_WEBHOOK_SECRET>`. Idempotent.
- Env vars (fly secrets): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` (the `@handle` minus `@`, for surfacing in `/api/v1/config/`).

---

## CSV flows

### Flow C1 — Upload + preview

1. User on `/orgs/<slug>/events/<eventSlug>/guests` clicks "Import CSV".
2. Modal opens with file input (`.csv` only, 5 MB max — enforced client and server).
3. User picks file → POST `/api/v1/orgs/<slug>/events/<eventSlug>/imports/preview/` (multipart).
4. Server response:
   ```json
   {
     "preview_id": "<uuid>",
     "headers": ["Name", "Email", "Company", "Notes"],
     "first_rows": [["Alice", "alice@x.com", "Acme", "VIP"], ...],
     "total_rows_estimate": 87,
     "auto_mapping": {"0": "name", "1": "email", "2": null, "3": null},
     "registration_fields": [
       {"id": "<uuid>", "label": "Company"},
       {"id": "<uuid>", "label": "Dietary requirements"}
     ]
   }
   ```
   The server temporarily stores the uploaded file keyed by `preview_id` (Redis or short-lived FileField). The commit step references this id.
5. UI shows preview table:
   - Each column header has a `<select>`: "Skip" / "Name" / "Email" / "Phone" / each `RegistrationField` label.
   - Auto-mapped columns are preselected with an "(auto)" badge.
   - First 5 rows below for sanity check.
6. User confirms → POST `/api/v1/orgs/<slug>/events/<eventSlug>/imports/` with `{preview_id, column_mapping}`.
7. Server creates `CsvImport` row with `status="pending"`, moves the staged file into the import's `file` field, enqueues `process_csv_import(import_id)`, returns `{import_id, status, total_rows}`.

**Preview validation:** reject at step 4 with `400` if the file has zero data rows, has more than ~50 columns (suspect malformed), or fails UTF-8 decode (after BOM stripping).

### Flow C2 — Async processing + polling

8. UI redirects to `/orgs/<slug>/events/<eventSlug>/imports/<id>/` (or shows inline progress).
9. UI polls `GET /api/v1/orgs/<slug>/events/<eventSlug>/imports/<id>/` every 2s via TanStack Query (`refetchInterval: 2000`, stops when `status` ∈ `{"complete", "failed"}`).
10. Celery task `process_csv_import(import_id)`:
    1. Load `CsvImport`. Set `status="running"`.
    2. Parse the file (Python `csv` module, `utf-8-sig` codec to strip BOM).
    3. Count total rows; set `total_rows`.
    4. For each row:
       - Build kwargs from `column_mapping`: `name`, `email`, `phone`, plus `custom_fields = {field_id: row[col]}` for each mapped `RegistrationField`.
       - Validate: required built-in fields (per event config), email regex, phone format.
       - Check duplicate: existing Guest with same `email` in same event → skip + error row.
       - Insert Guest with `source="csv_import"`.
       - Emit `guest.created_via_csv` audit with `csv_import_id` in `details_json`.
    5. Increment `imported_rows` / `failed_rows`.
    6. Generate error_report CSV in memory; write to `CsvImport.error_report` FileField.
    7. Set `status="complete"` + `completed_at`.

### Flow C3 — Auto-detect

```python
NAME_ALIASES = {"name", "fullname", "full_name", "attendee", "guest_name"}
EMAIL_ALIASES = {"email", "email_address", "e-mail", "mail"}
PHONE_ALIASES = {"phone", "phone_number", "tel", "mobile", "phone_or_chat"}

def auto_detect(headers: list[str]) -> dict[str, str | None]:
    out: dict[str, str | None] = {}
    for i, header in enumerate(headers):
        norm = header.strip().lower().replace(" ", "_")
        if norm in NAME_ALIASES:
            out[str(i)] = "name"
        elif norm in EMAIL_ALIASES:
            out[str(i)] = "email"
        elif norm in PHONE_ALIASES:
            out[str(i)] = "phone"
        else:
            out[str(i)] = None
    return out
```

### Flow C4 — Error report format

```csv
row_number,raw_data,errors
2,"John Smith,john@,Acme",Invalid email format
17,"Alice,,Acme",Email field empty
23,"Bob Doe,bob@x.com,",Duplicate: email already registered for this event
```

`row_number` is 1-indexed and **excludes the header row** (so row 2 = first data row in the original file).

### Flow C5 — Edge cases

- **BOM at file start:** stripped by `utf-8-sig` codec.
- **Mixed line endings (CRLF/LF):** handled natively by `csv` module.
- **Quoted commas:** handled natively by `csv` module.
- **Trailing empty columns (Excel-saved CSVs):** drop empty trailing columns per row before applying `column_mapping`.
- **Unicode in fields (Khmer, Japanese, accented Latin):** UTF-8 throughout; no transliteration.
- **Empty file / header-only file:** reject at preview with `400` and `"File must contain at least one data row."`.
- **File > 5 MB:** reject upload with `413` and `"File too large. Max 5 MB."`.

---

## Testing strategy

**Backend (pytest):**

- **Unit tests:**
  - `auto_detect()` — table-driven over all alias variations + unmapped + empty headers.
  - CSV row parsing — quoted commas, BOM, mixed line endings, trailing empties.
  - Guest-kwargs validation — required fields, email format, phone format.
- **Integration tests (Django + Postgres):**
  - Telegram webhook `/start <token>` happy path → creates `TelegramBinding` + audit row + enqueues `send_qr_telegram`.
  - Telegram webhook `/start <invalid_token>` → no binding; `notifications.telegram_unknown_start` audit; bot reply scheduled.
  - Telegram webhook signature mismatch → 200 + no-op (no binding, no audit, log warning).
  - Telegram rebound flow (same chat_id, different guest_token) → binding replaced, `notifications.telegram_rebound` audit.
  - `send_qr_telegram` happy path with Telegram API mocked → `notifications.telegram_sent` audit.
  - `send_qr_telegram` Telegram-429 retry exhausted → `notifications.telegram_failed` audit + `send_qr_email` enqueued.
  - CSV preview endpoint with sample CSV → correct `auto_mapping` + `registration_fields` response.
  - CSV import endpoint → `CsvImport` row created, task enqueued (eager mode).
  - `process_csv_import` with mixed-valid/invalid sample CSV → counters match, error_report file generated, Guest rows + audit rows correct.

**Frontend (Vitest):**

- CSV upload dialog: file selection → preview render → column-mapping dropdown interaction → submit.
- Import status / detail view: polling, progress display, error-report download link visibility.

**Manual smoke (verification doc, Task 12):**

- Real test bot in dev env: register a guest → click Telegram CTA → verify QR arrives + binding row + audit row.
- Real CSV upload with 5-row mixed file (3 valid, 2 invalid): preview correct, import completes, error report downloads, counters match.

---

## Tasks

> To be written via `superpowers:writing-plans` skill in the next pass. The 12-task shape above is the starting point.
