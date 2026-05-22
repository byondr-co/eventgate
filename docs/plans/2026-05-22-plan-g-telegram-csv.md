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

## Implementation-shape decisions locked at writing-plans

- **Preview-file staging:** A `CsvImport` row with `status="preview"` holds the uploaded file between preview and commit. No new infrastructure beyond the model + a sweeper. A periodic Celery beat task `sweep_preview_imports` deletes preview-status rows older than 24 hours.
- **`bot_username` exposure:** Two env vars. Backend `TELEGRAM_BOT_USERNAME` (used by `setup_telegram_webhook` + the email template). Frontend `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (baked into Vercel build; used by the confirmation page CTA). No `/api/v1/config/` endpoint needed.
- **`send_qr_telegram_task` location:** `apps/notifications/tasks.py` (NEW file) — co-located with `TelegramBinding`, webhook view, and Telegram service helpers. `send_qr_email_task` stays in `apps/guests/tasks.py` unchanged (cross-app import is fine).
- **Sentinel file paths confirmed by research:** `backend/fly.toml`, `backend/apps/notifications/models.py` (has `NotificationDispatch`), `backend/apps/guests/services.py::register_guest(*, event, payload, source="public_form")`, `backend/apps/audit/services.py` (audit emit helper), `frontend/app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx` (registration confirmation), `frontend/components/ui/` (no shadcn `dialog` yet — Task 9 installs it).

---

## Task 1 — `TelegramBinding` model + migration

> Add the model joining a Telegram chat_id to a Guest row. Inherits `OrgScopedModel`; `organization` derives from `guest.event.organization` in `save()`. One-to-one against Guest; `chat_id` unique globally.

**Files:**
- Modify: `backend/apps/notifications/models.py`
- Create: `backend/apps/notifications/migrations/0002_telegrambinding.py` (auto-generated)
- Create: `backend/tests/test_telegram_binding.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_telegram_binding.py
import pytest

from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.services import register_guest
from apps.notifications.models import TelegramBinding
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    return ev


@pytest.mark.django_db
class TestTelegramBinding:
    def test_create_binding_sets_org_from_guest(self, event):
        guest = register_guest(
            event=event,
            payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
        )
        b = TelegramBinding.objects.create(guest=guest, chat_id=12345, username="alice_tg")
        assert b.organization == event.organization
        assert b.chat_id == 12345
        assert b.username == "alice_tg"
        assert b.bound_at is not None

    def test_chat_id_is_unique(self, event):
        g1 = register_guest(event=event, payload={"name": "A", "email": "a@x.com", "phone_or_chat": "+1"})
        g2 = register_guest(event=event, payload={"name": "B", "email": "b@x.com", "phone_or_chat": "+2"})
        TelegramBinding.objects.create(guest=g1, chat_id=999)
        with pytest.raises(Exception):
            TelegramBinding.objects.create(guest=g2, chat_id=999)
```

- [ ] **Step 2: Verify the test fails**

```bash
cd backend && uv run pytest tests/test_telegram_binding.py -v
```

Expected: `ImportError: cannot import name 'TelegramBinding'`.

- [ ] **Step 3: Add `TelegramBinding` to `apps/notifications/models.py`**

Append to the existing file (after `NotificationDispatch`). Add this import at the top of the file (above the existing `from django.db import models` block):

```python
from apps.common.models import OrgScopedModel
```

And the model itself, appended below `NotificationDispatch`:

```python
class TelegramBinding(OrgScopedModel):
    """Joins a Telegram chat_id to a Guest row. Created on /start <guest_token>."""

    guest = models.OneToOneField(
        "guests.Guest", on_delete=models.CASCADE, related_name="telegram_binding"
    )
    chat_id = models.BigIntegerField(unique=True)
    username = models.CharField(max_length=64, blank=True)
    bound_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = (models.Index(fields=["chat_id"]),)

    def save(self, *args, **kwargs):
        if not self.organization_id and self.guest_id:
            self.organization = self.guest.event.organization
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"TelegramBinding(chat_id={self.chat_id}, guest={self.guest_id})"
```

- [ ] **Step 4: Generate the migration**

```bash
cd backend && uv run python manage.py makemigrations notifications
```

Expected: `Migrations for 'notifications':` followed by `notifications/migrations/0002_telegrambinding.py`.

- [ ] **Step 5: Apply + run the test**

```bash
cd backend && uv run python manage.py migrate && uv run pytest tests/test_telegram_binding.py -v
```

Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications/models.py backend/apps/notifications/migrations/0002_telegrambinding.py backend/tests/test_telegram_binding.py
git commit -m "feat(notifications): TelegramBinding model joining chat_id to Guest"
```

---

## Task 2 — `setup_telegram_webhook` management command + fly `release_command`

> One-shot command (idempotent) that registers the webhook URL with Telegram. Invoked from `fly.toml` `release_command` after the migrate step.

**Files:**
- Create: `backend/apps/notifications/management/__init__.py`
- Create: `backend/apps/notifications/management/commands/__init__.py`
- Create: `backend/apps/notifications/management/commands/setup_telegram_webhook.py`
- Modify: `backend/fly.toml` (extend `release_command`)
- Create: `backend/tests/test_setup_telegram_webhook.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_setup_telegram_webhook.py
from unittest.mock import patch

import pytest
from django.core.management import call_command


@pytest.mark.django_db
@patch("apps.notifications.management.commands.setup_telegram_webhook.requests.post")
def test_setup_webhook_posts_correct_payload(mock_post, settings):
    settings.TELEGRAM_BOT_TOKEN = "test_token"
    settings.TELEGRAM_WEBHOOK_SECRET = "test_secret"
    settings.TELEGRAM_WEBHOOK_URL = "https://example.com/api/v1/telegram/webhook/"
    mock_post.return_value.json.return_value = {"ok": True}
    mock_post.return_value.status_code = 200

    call_command("setup_telegram_webhook")

    mock_post.assert_called_once_with(
        "https://api.telegram.org/bottest_token/setWebhook",
        json={
            "url": "https://example.com/api/v1/telegram/webhook/",
            "secret_token": "test_secret",
            "allowed_updates": ["message"],
        },
        timeout=10,
    )


@patch("apps.notifications.management.commands.setup_telegram_webhook.requests.post")
def test_setup_webhook_skips_when_token_missing(mock_post, settings, capsys):
    settings.TELEGRAM_BOT_TOKEN = ""
    call_command("setup_telegram_webhook")
    mock_post.assert_not_called()
    captured = capsys.readouterr()
    assert "TELEGRAM_BOT_TOKEN not set" in captured.out
```

- [ ] **Step 2: Verify the test fails**

```bash
cd backend && uv run pytest tests/test_setup_telegram_webhook.py -v
```

Expected: `Unknown command: 'setup_telegram_webhook'`.

- [ ] **Step 3: Create the management command structure**

```bash
mkdir -p backend/apps/notifications/management/commands
touch backend/apps/notifications/management/__init__.py
touch backend/apps/notifications/management/commands/__init__.py
```

- [ ] **Step 4: Write `setup_telegram_webhook.py`**

```python
# backend/apps/notifications/management/commands/setup_telegram_webhook.py
"""Register the Telegram webhook URL with the Telegram Bot API.

Idempotent — safe to invoke on every deploy. Skipped gracefully when
TELEGRAM_BOT_TOKEN is unset (e.g., local dev without a bot).
"""

from __future__ import annotations

import requests
from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Register the Telegram webhook URL with Telegram."

    def handle(self, *args, **options) -> None:
        token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
        secret = getattr(settings, "TELEGRAM_WEBHOOK_SECRET", "")
        url = getattr(settings, "TELEGRAM_WEBHOOK_URL", "")

        if not token:
            self.stdout.write("TELEGRAM_BOT_TOKEN not set; skipping webhook registration.")
            return
        if not url:
            self.stdout.write("TELEGRAM_WEBHOOK_URL not set; skipping webhook registration.")
            return

        resp = requests.post(
            f"https://api.telegram.org/bot{token}/setWebhook",
            json={
                "url": url,
                "secret_token": secret,
                "allowed_updates": ["message"],
            },
            timeout=10,
        )
        body = resp.json()
        if resp.status_code != 200 or not body.get("ok"):
            raise RuntimeError(f"setWebhook failed: status={resp.status_code} body={body}")
        self.stdout.write(self.style.SUCCESS(f"Webhook registered: {url}"))
```

- [ ] **Step 5: Add the three settings keys to `backend/config/settings/base.py`**

Find the existing settings block (somewhere near other env-driven values) and append:

```python
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", default="")
TELEGRAM_BOT_USERNAME = env("TELEGRAM_BOT_USERNAME", default="")
TELEGRAM_WEBHOOK_SECRET = env("TELEGRAM_WEBHOOK_SECRET", default="")
TELEGRAM_WEBHOOK_URL = env("TELEGRAM_WEBHOOK_URL", default="")
```

(Where `env` is the `django-environ` helper already used by this settings file. If the file uses `os.environ.get` instead, substitute accordingly.)

- [ ] **Step 6: Verify the tests pass**

```bash
cd backend && uv run pytest tests/test_setup_telegram_webhook.py -v
```

Expected: both tests PASS.

- [ ] **Step 7: Extend `backend/fly.toml` `release_command`**

Find:

```toml
[deploy]
  release_command = "python manage.py migrate --noinput"
```

Replace with:

```toml
[deploy]
  release_command = "python manage.py migrate --noinput && python manage.py setup_telegram_webhook"
```

- [ ] **Step 8: Commit**

```bash
git add backend/apps/notifications/management backend/tests/test_setup_telegram_webhook.py backend/config/settings/base.py backend/fly.toml
git commit -m "feat(notifications): setup_telegram_webhook command + fly release_command"
```

---

## Task 3 — Webhook view + Telegram service helpers + URL routing

> `POST /api/v1/telegram/webhook/`. Verifies `X-Telegram-Bot-Api-Secret-Token` header, parses `/start <guest_token>`, upserts `TelegramBinding`, enqueues `send_qr_telegram`, replies to the user via Telegram's `sendMessage`. Always returns 200 OK to Telegram.

**Files:**
- Create: `backend/apps/notifications/services.py`
- Create: `backend/apps/notifications/views.py`
- Create: `backend/apps/notifications/urls.py`
- Modify: `backend/config/urls.py` (include the new urls)
- Create: `backend/tests/test_telegram_webhook.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_telegram_webhook.py
from unittest.mock import patch

import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.services import register_guest
from apps.notifications.models import TelegramBinding
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    return ev


@pytest.fixture
def webhook_url():
    return "/api/v1/telegram/webhook/"


def _update(text: str, chat_id: int = 111, username: str = "alice"):
    return {
        "update_id": 1,
        "message": {
            "message_id": 1,
            "from": {"id": chat_id, "username": username, "first_name": "Alice"},
            "chat": {"id": chat_id, "type": "private"},
            "date": 1700000000,
            "text": text,
        },
    }


@pytest.mark.django_db
@patch("apps.notifications.services.send_message")
@patch("apps.notifications.views.send_qr_telegram_task")
class TestTelegramWebhook:
    def _post(self, client, url, payload, secret=None):
        headers = {}
        if secret is not None:
            headers["HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN"] = secret
        return client.post(url, data=payload, content_type="application/json", **headers)

    def test_secret_mismatch_returns_200_no_op(self, mock_task, mock_reply, client, event, webhook_url, settings):
        settings.TELEGRAM_WEBHOOK_SECRET = "right"
        resp = self._post(client, webhook_url, _update("/start anything"), secret="wrong")
        assert resp.status_code == 200
        mock_task.delay.assert_not_called()
        mock_reply.assert_not_called()
        assert TelegramBinding.objects.count() == 0

    def test_start_unknown_token_replies_and_audits(self, mock_task, mock_reply, client, event, webhook_url, settings):
        settings.TELEGRAM_WEBHOOK_SECRET = "secret"
        resp = self._post(client, webhook_url, _update("/start nonexistent_token"), secret="secret")
        assert resp.status_code == 200
        mock_task.delay.assert_not_called()
        mock_reply.assert_called_once()
        assert "no longer valid" in mock_reply.call_args.kwargs["text"]
        assert AuditEvent.objects.filter(action="notifications.telegram_unknown_start").count() == 1

    def test_start_known_token_creates_binding_audits_and_enqueues(
        self, mock_task, mock_reply, client, event, webhook_url, settings
    ):
        settings.TELEGRAM_WEBHOOK_SECRET = "secret"
        guest = register_guest(
            event=event,
            payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
        )
        resp = self._post(client, webhook_url, _update(f"/start {guest.entry_token}", chat_id=42), secret="secret")
        assert resp.status_code == 200
        b = TelegramBinding.objects.get(guest=guest)
        assert b.chat_id == 42
        assert b.username == "alice"
        mock_task.delay.assert_called_once_with(guest_id=str(guest.id))
        assert AuditEvent.objects.filter(action="notifications.telegram_bound").count() == 1

    def test_start_rebound_replaces_existing_binding(
        self, mock_task, mock_reply, client, event, webhook_url, settings
    ):
        settings.TELEGRAM_WEBHOOK_SECRET = "secret"
        g1 = register_guest(event=event, payload={"name": "A", "email": "a@x.com", "phone_or_chat": "+1"})
        g2 = register_guest(event=event, payload={"name": "B", "email": "b@x.com", "phone_or_chat": "+2"})
        TelegramBinding.objects.create(guest=g1, chat_id=42, username="alice")
        resp = self._post(client, webhook_url, _update(f"/start {g2.entry_token}", chat_id=42), secret="secret")
        assert resp.status_code == 200
        # The chat_id=42 binding now belongs to g2; g1's binding is gone (one-to-one).
        assert TelegramBinding.objects.filter(chat_id=42).get().guest == g2
        assert not TelegramBinding.objects.filter(guest=g1).exists()
        assert AuditEvent.objects.filter(action="notifications.telegram_rebound").count() == 1

    def test_non_start_message_gets_generic_reply(self, mock_task, mock_reply, client, event, webhook_url, settings):
        settings.TELEGRAM_WEBHOOK_SECRET = "secret"
        resp = self._post(client, webhook_url, _update("hello bot"), secret="secret")
        assert resp.status_code == 200
        mock_task.delay.assert_not_called()
        mock_reply.assert_called_once()
        assert "Get on Telegram" in mock_reply.call_args.kwargs["text"]
        assert AuditEvent.objects.filter(action__startswith="notifications.telegram").count() == 0
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && uv run pytest tests/test_telegram_webhook.py -v
```

Expected: `404 Not Found` (URL not registered) on every test.

- [ ] **Step 3: Write `services.py`**

```python
# backend/apps/notifications/services.py
"""Telegram Bot API helpers — thin HTTP wrappers."""

from __future__ import annotations

import requests
from django.conf import settings


def send_message(*, chat_id: int, text: str) -> None:
    """Send a text message via Telegram. Logs and swallows errors — non-fatal."""
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    if not token:
        return  # no-op in dev/test without token
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=10,
        )
    except requests.RequestException:
        # Reply failures shouldn't break the webhook — webhook still returns 200.
        pass


def send_photo(*, chat_id: int, photo_bytes: bytes, caption: str = "", filename: str = "qr.png") -> None:
    """Send a photo (raw bytes) via Telegram. Raises on non-200; caller decides retry."""
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    if not token:
        return
    resp = requests.post(
        f"https://api.telegram.org/bot{token}/sendPhoto",
        data={"chat_id": chat_id, "caption": caption},
        files={"photo": (filename, photo_bytes, "image/png")},
        timeout=15,
    )
    if resp.status_code != 200:
        # Raise with the status code so the Celery task can introspect (e.g. 429).
        raise requests.HTTPError(response=resp)
```

- [ ] **Step 4: Write `views.py`**

```python
# backend/apps/notifications/views.py
"""Telegram webhook endpoint."""

from __future__ import annotations

import json
import logging
from typing import Any

from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.audit.services import emit
from apps.guests.models import Guest
from apps.notifications.models import TelegramBinding
from apps.notifications.services import send_message
from apps.notifications.tasks import send_qr_telegram_task

logger = logging.getLogger(__name__)


def _generic_reply() -> str:
    return (
        "Hi! To receive your QR code, please use the 'Get on Telegram' button on your event "
        "registration confirmation page."
    )


@csrf_exempt
@require_POST
def telegram_webhook(request: HttpRequest) -> HttpResponse:
    # 1. Verify secret token header — always return 200 + no-op on mismatch.
    expected = getattr(settings, "TELEGRAM_WEBHOOK_SECRET", "")
    received = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not expected or received != expected:
        logger.warning("telegram_webhook: secret mismatch")
        return JsonResponse({"ok": True})

    # 2. Parse the update body — swallow malformed JSON.
    try:
        update: dict[str, Any] = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        logger.warning("telegram_webhook: malformed body")
        return JsonResponse({"ok": True})

    message = update.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    username = (message.get("from") or {}).get("username", "") or ""
    text = (message.get("text") or "").strip()

    if not chat_id or not text:
        return JsonResponse({"ok": True})

    # 3. Dispatch on /start <token> vs. anything else.
    if text.startswith("/start "):
        token = text[len("/start "):].strip()
        _handle_start(chat_id=chat_id, username=username, token=token)
    else:
        send_message(chat_id=chat_id, text=_generic_reply())

    return JsonResponse({"ok": True})


def _handle_start(*, chat_id: int, username: str, token: str) -> None:
    try:
        guest = Guest.objects.select_related("event__organization").get(entry_token=token)
    except Guest.DoesNotExist:
        send_message(
            chat_id=chat_id,
            text="Sorry, this link is no longer valid. Please contact your event organizer.",
        )
        emit(
            organization=None,
            event=None,
            guest=None,
            actor_type="telegram",
            actor_id=str(chat_id),
            action="notifications.telegram_unknown_start",
            result="warning",
            entry_token=token[:8],  # redacted prefix
            details={"chat_id": chat_id},
        )
        return

    existing = TelegramBinding.objects.filter(chat_id=chat_id).first()
    if existing and existing.guest_id != guest.id:
        # Rebound: a chat_id previously bound to another guest now binds to this one.
        # Delete the old binding; create the new (one-to-one constraint on Guest is preserved).
        existing.delete()
        emit(
            organization=guest.event.organization,
            event=guest.event,
            guest=guest,
            actor_type="telegram",
            actor_id=str(chat_id),
            action="notifications.telegram_rebound",
            result="success",
            entry_token=guest.entry_token,
            details={"chat_id": chat_id, "previous_guest_id": str(existing.guest_id)},
        )
        TelegramBinding.objects.create(guest=guest, chat_id=chat_id, username=username)
    elif not existing:
        # Also delete any pre-existing binding on THIS guest (one-to-one).
        TelegramBinding.objects.filter(guest=guest).delete()
        TelegramBinding.objects.create(guest=guest, chat_id=chat_id, username=username)
        emit(
            organization=guest.event.organization,
            event=guest.event,
            guest=guest,
            actor_type="telegram",
            actor_id=str(chat_id),
            action="notifications.telegram_bound",
            result="success",
            entry_token=guest.entry_token,
            details={"chat_id": chat_id, "username": username},
        )
    # else: binding already matches; no-op binding, still enqueue resend below.

    send_qr_telegram_task.delay(guest_id=str(guest.id))
```

- [ ] **Step 5: Write `urls.py` + include in root urls**

```python
# backend/apps/notifications/urls.py
from django.urls import path

from apps.notifications.views import telegram_webhook

urlpatterns = [
    path("telegram/webhook/", telegram_webhook, name="telegram-webhook"),
]
```

In `backend/config/urls.py`, find the `urlpatterns = [` list and add (within the `api/v1/` prefix group already present):

```python
path("api/v1/", include("apps.notifications.urls")),
```

(If the existing urls use a different include style, mirror it. The key is that `/api/v1/telegram/webhook/` resolves to `telegram_webhook`.)

- [ ] **Step 6: Verify the tests pass**

```bash
cd backend && uv run pytest tests/test_telegram_webhook.py -v
```

Expected: all 5 tests PASS.

> **Note:** `send_qr_telegram_task` is imported but not yet implemented — the tests mock it. Task 4 implements the task itself.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/notifications/services.py backend/apps/notifications/views.py backend/apps/notifications/urls.py backend/config/urls.py backend/tests/test_telegram_webhook.py
git commit -m "feat(notifications): telegram webhook endpoint + /start handler"
```

---

## Task 4 — `send_qr_telegram_task` Celery task

> Render QR PNG via `segno`, call Telegram `sendPhoto`, emit audit on success; on 429 retry with backoff; on final failure enqueue `send_qr_email` fallback + emit failed audit.

**Files:**
- Create: `backend/apps/notifications/tasks.py`
- Create: `backend/tests/test_telegram_send_task.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_telegram_send_task.py
from unittest.mock import patch

import pytest
import requests

from apps.audit.models import AuditEvent
from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.services import register_guest
from apps.notifications.models import NotificationDispatch, TelegramBinding
from apps.notifications.tasks import send_qr_telegram_task
from apps.orgs.models import Organization


@pytest.fixture
def bound_guest(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    guest = register_guest(
        event=ev,
        payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
    )
    TelegramBinding.objects.create(guest=guest, chat_id=42, username="alice")
    return guest


@pytest.mark.django_db
class TestSendQrTelegramTask:
    @patch("apps.notifications.tasks.send_photo")
    def test_happy_path_creates_dispatch_and_audit(self, mock_send, bound_guest):
        send_qr_telegram_task(guest_id=str(bound_guest.id))
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        assert kwargs["chat_id"] == 42
        assert kwargs["photo_bytes"][:8] == b"\x89PNG\r\n\x1a\n"
        d = NotificationDispatch.objects.get(guest=bound_guest, channel="telegram")
        assert d.status == "sent"
        assert AuditEvent.objects.filter(action="notifications.telegram_sent").count() == 1

    @patch("apps.notifications.tasks.send_qr_email_task")
    @patch("apps.notifications.tasks.send_photo")
    def test_unbound_guest_falls_back_to_email(self, mock_send, mock_email_task, db):
        org = Organization.objects.create(name="Acme", slug="acme")
        ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
        seed_preset_fields(ev)
        guest = register_guest(
            event=ev,
            payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
        )
        # No TelegramBinding — task should bail out and enqueue email fallback.
        send_qr_telegram_task(guest_id=str(guest.id))
        mock_send.assert_not_called()
        mock_email_task.delay.assert_called_once_with(guest_id=str(guest.id))

    @patch("apps.notifications.tasks.send_qr_email_task")
    @patch("apps.notifications.tasks.send_photo")
    def test_final_failure_emits_failed_audit_and_email_fallback(
        self, mock_send, mock_email_task, bound_guest
    ):
        bad_resp = type("R", (), {"status_code": 500, "text": "boom"})()
        mock_send.side_effect = requests.HTTPError(response=bad_resp)
        # bind=True task; manually exhaust retries
        with pytest.raises(requests.HTTPError):
            send_qr_telegram_task.apply(kwargs={"guest_id": str(bound_guest.id)}).get(disable_sync_subtasks=False)
        # After all retries exhausted, _on_final_failure is called: ensure audit + fallback.
        # (Implementation detail: the on_failure handler runs after max_retries.)
        assert AuditEvent.objects.filter(action="notifications.telegram_failed").exists()
        mock_email_task.delay.assert_called_with(guest_id=str(bound_guest.id))
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && uv run pytest tests/test_telegram_send_task.py -v
```

Expected: `ImportError: cannot import name 'send_qr_telegram_task'`.

- [ ] **Step 3: Implement `tasks.py`**

```python
# backend/apps/notifications/tasks.py
"""Telegram QR delivery Celery task."""

from __future__ import annotations

import logging

import requests
from celery import shared_task
from django.utils import timezone

from apps.audit.services import emit
from apps.common.qr import render_png
from apps.guests.models import Guest
from apps.guests.tasks import send_qr_email_task
from apps.notifications.models import NotificationDispatch, TelegramBinding
from apps.notifications.services import send_photo

logger = logging.getLogger(__name__)


@shared_task(
    name="notifications.send_qr_telegram",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def send_qr_telegram_task(self, *, guest_id: str) -> str:
    guest = Guest.objects.select_related("event", "organization").get(id=guest_id)
    binding = TelegramBinding.objects.filter(guest=guest).first()
    if not binding:
        # No binding — fall back to email immediately.
        if guest.email:
            send_qr_email_task.delay(guest_id=str(guest.id))
        return "skipped:no_binding"

    dispatch = NotificationDispatch.objects.create(
        organization=guest.organization,
        event=guest.event,
        guest=guest,
        channel="telegram",
        template="pre_reg_qr",
        recipient=str(binding.chat_id),
        status="queued",
    )

    try:
        png = render_png(guest.entry_token)
        caption = f"Your QR code for {guest.event.name}. Show this at the gate."
        send_photo(chat_id=binding.chat_id, photo_bytes=png, caption=caption)

        dispatch.status = "sent"
        dispatch.sent_at = timezone.now()
        dispatch.attempts = self.request.retries + 1
        dispatch.save(update_fields=["status", "sent_at", "attempts"])

        emit(
            organization=guest.organization,
            event=guest.event,
            guest=guest,
            actor_type="system",
            actor_id="celery",
            action="notifications.telegram_sent",
            result="success",
            entry_token=guest.entry_token,
            details={"chat_id": binding.chat_id, "dispatch_id": str(dispatch.id)},
        )
    except requests.HTTPError as exc:
        dispatch.status = "failed"
        dispatch.error = f"HTTP {getattr(exc.response, 'status_code', '?')}"
        dispatch.attempts = self.request.retries + 1
        dispatch.save(update_fields=["status", "error", "attempts"])

        if self.request.retries >= self.max_retries:
            # Final failure: emit failed audit + email fallback.
            emit(
                organization=guest.organization,
                event=guest.event,
                guest=guest,
                actor_type="system",
                actor_id="celery",
                action="notifications.telegram_failed",
                result="error",
                entry_token=guest.entry_token,
                details={
                    "chat_id": binding.chat_id,
                    "dispatch_id": str(dispatch.id),
                    "last_error": dispatch.error,
                },
            )
            if guest.email:
                send_qr_email_task.delay(guest_id=str(guest.id))
            raise
        # Retry: respect Telegram's Retry-After header if present.
        retry_after = 0
        if exc.response is not None:
            retry_after = int(exc.response.headers.get("Retry-After", 0) or 0)
        raise self.retry(exc=exc, countdown=max(retry_after, self.default_retry_delay))

    return str(dispatch.id)
```

- [ ] **Step 4: Verify tests pass**

```bash
cd backend && uv run pytest tests/test_telegram_send_task.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/tasks.py backend/tests/test_telegram_send_task.py
git commit -m "feat(notifications): send_qr_telegram Celery task with retry + email fallback"
```

---

## Task 5 — `CsvImport` model + migration

> Tracks each CSV import job. New status enum includes `"preview"` (uploaded but not yet committed) per the implementation-shape decision above.

**Files:**
- Modify: `backend/apps/guests/models.py`
- Create: `backend/apps/guests/migrations/0003_csvimport.py` (auto-generated)
- Create: `backend/tests/test_csv_import_model.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_csv_import_model.py
import pytest

from apps.accounts.models import User
from apps.events.models import Event
from apps.guests.models import CsvImport
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    return Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)


@pytest.mark.django_db
class TestCsvImport:
    def test_create_preview_row(self, event):
        user = User.objects.create_user(email="u@x.com", password="x")
        ci = CsvImport.objects.create(
            event=event, uploaded_by=user, column_mapping={}, status="preview"
        )
        assert ci.organization == event.organization
        assert ci.status == "preview"
        assert ci.total_rows == 0
        assert ci.imported_rows == 0
        assert ci.failed_rows == 0
        assert ci.created_at is not None
        assert ci.completed_at is None
```

- [ ] **Step 2: Verify fails**

```bash
cd backend && uv run pytest tests/test_csv_import_model.py -v
```

Expected: `ImportError: cannot import name 'CsvImport'`.

- [ ] **Step 3: Add the model to `apps/guests/models.py`**

Append to the existing file (after `Guest`):

```python
class CsvImport(OrgScopedModel):
    """A CSV guest-import job. Status transitions: preview → pending → running → complete/failed."""

    STATUSES = (
        ("preview", "Preview"),
        ("pending", "Pending"),
        ("running", "Running"),
        ("complete", "Complete"),
        ("failed", "Failed"),
    )

    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="csv_imports")
    uploaded_by = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="csv_imports"
    )
    file = models.FileField(upload_to="csv_imports/%Y/%m/%d/")
    column_mapping = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=STATUSES, default="preview")
    total_rows = models.IntegerField(default=0)
    imported_rows = models.IntegerField(default=0)
    failed_rows = models.IntegerField(default=0)
    error_report = models.FileField(upload_to="csv_imports/errors/%Y/%m/%d/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if not self.organization_id and self.event_id:
            self.organization = self.event.organization
        super().save(*args, **kwargs)
```

- [ ] **Step 4: Generate the migration**

```bash
cd backend && uv run python manage.py makemigrations guests
```

Expected: `Migrations for 'guests':` followed by `guests/migrations/0003_csvimport.py`.

- [ ] **Step 5: Apply + run the test**

```bash
cd backend && uv run python manage.py migrate && uv run pytest tests/test_csv_import_model.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/guests/models.py backend/apps/guests/migrations/0003_csvimport.py backend/tests/test_csv_import_model.py
git commit -m "feat(guests): CsvImport model with preview/pending/running/complete/failed statuses"
```

---

## Task 6 — CSV preview endpoint + `auto_detect` helper

> `POST /api/v1/orgs/<slug>/events/<eventSlug>/imports/preview/` — accepts multipart upload, parses headers + first 5 rows, returns auto-mapping suggestion + event's `RegistrationField`s. Creates a `CsvImport` row with `status="preview"`. Enforces 5 MB max + UTF-8 + ≥1 data row.

**Files:**
- Modify: `backend/apps/guests/services.py` (add `auto_detect` + `parse_csv_preview`)
- Modify: `backend/apps/guests/views.py` (add `CsvImportPreviewView`)
- Modify: `backend/apps/guests/serializers.py` (add `CsvImportPreviewSerializer`)
- Modify: `backend/apps/guests/urls.py` (add route)
- Create: `backend/tests/test_csv_preview.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_csv_preview.py
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.guests.models import CsvImport
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def auth_client(db, client):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="u@x.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="admin")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    RegistrationField.objects.create(event=ev, field_key="company", label="Company", required=False)
    client.force_login(user)
    return client, org, ev


def _csv_file(content: str, name: str = "guests.csv") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content.encode("utf-8"), content_type="text/csv")


@pytest.mark.django_db
class TestCsvPreview:
    def test_happy_path_returns_auto_mapping_and_creates_preview_row(self, auth_client):
        client, org, ev = auth_client
        f = _csv_file("Name,Email,Company\nAlice,alice@x.com,Acme\nBob,bob@x.com,Globex\n")
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/preview/",
            data={"file": f},
            format="multipart",
        )
        assert resp.status_code == 200, resp.json()
        body = resp.json()
        assert body["headers"] == ["Name", "Email", "Company"]
        assert body["first_rows"] == [["Alice", "alice@x.com", "Acme"], ["Bob", "bob@x.com", "Globex"]]
        assert body["auto_mapping"] == {"0": "name", "1": "email", "2": None}
        assert len(body["registration_fields"]) >= 1
        assert any(rf["label"] == "Company" for rf in body["registration_fields"])
        assert CsvImport.objects.filter(event=ev, status="preview").count() == 1
        assert body["preview_id"] == str(CsvImport.objects.get(event=ev, status="preview").id)

    def test_empty_file_returns_400(self, auth_client):
        client, org, ev = auth_client
        f = _csv_file("")
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/preview/",
            data={"file": f},
            format="multipart",
        )
        assert resp.status_code == 400
        assert "data row" in resp.json()["detail"].lower()

    def test_header_only_returns_400(self, auth_client):
        client, org, ev = auth_client
        f = _csv_file("Name,Email\n")
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/preview/",
            data={"file": f},
            format="multipart",
        )
        assert resp.status_code == 400

    def test_large_file_returns_413(self, auth_client):
        client, org, ev = auth_client
        content = "Name,Email\n" + ("a,b\n" * 2_000_000)  # > 5MB
        f = _csv_file(content)
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/preview/",
            data={"file": f},
            format="multipart",
        )
        assert resp.status_code == 413
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && uv run pytest tests/test_csv_preview.py -v
```

Expected: 404 on every test.

- [ ] **Step 3: Add `auto_detect` + `parse_csv_preview` to `apps/guests/services.py`**

Append to the existing file:

```python
import csv as _csv
import io as _io

NAME_ALIASES: set[str] = {"name", "fullname", "full_name", "attendee", "guest_name"}
EMAIL_ALIASES: set[str] = {"email", "email_address", "e-mail", "mail"}
PHONE_ALIASES: set[str] = {"phone", "phone_number", "tel", "mobile", "phone_or_chat"}

MAX_CSV_BYTES = 5 * 1024 * 1024  # 5MB
MAX_PREVIEW_ROWS = 5


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


class CsvParseError(Exception):
    """Raised when an uploaded CSV can't be parsed or has no data rows."""


def parse_csv_preview(file_bytes: bytes) -> tuple[list[str], list[list[str]]]:
    """Decode + parse a CSV file. Returns (headers, first_5_data_rows).

    Raises CsvParseError if the file can't be decoded as UTF-8 (after BOM strip)
    or has zero data rows.
    """
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CsvParseError("File must be UTF-8 encoded.") from exc

    reader = _csv.reader(_io.StringIO(text))
    try:
        headers = next(reader)
    except StopIteration as exc:
        raise CsvParseError("File must contain at least one data row.") from exc

    rows: list[list[str]] = []
    for row in reader:
        if not row:
            continue
        rows.append(row)
        if len(rows) >= MAX_PREVIEW_ROWS:
            break

    if not rows:
        raise CsvParseError("File must contain at least one data row.")

    return headers, rows
```

- [ ] **Step 4: Add the view to `apps/guests/views.py`**

Append the view:

```python
from rest_framework.parsers import MultiPartParser

from apps.guests.models import CsvImport
from apps.guests.services import (
    MAX_CSV_BYTES,
    CsvParseError,
    auto_detect,
    parse_csv_preview,
)


class CsvImportPreviewView(APIView):
    authentication_classes: ClassVar = []  # use default session auth from settings
    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]
    parser_classes: ClassVar = [MultiPartParser]

    def post(self, request: Request, slug: str, eventSlug: str) -> Response:
        event = get_object_or_404(Event, organization__slug=slug, slug=eventSlug)
        self.check_object_permissions(request, event)

        uploaded = request.FILES.get("file")
        if uploaded is None:
            return Response({"detail": "Missing file."}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded.size > MAX_CSV_BYTES:
            return Response(
                {"detail": "File too large. Max 5 MB."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        raw = uploaded.read()
        try:
            headers, rows = parse_csv_preview(raw)
        except CsvParseError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Persist as a preview CsvImport row.
        uploaded.seek(0)
        ci = CsvImport.objects.create(
            event=event,
            uploaded_by=request.user,
            file=uploaded,
            column_mapping={},
            status="preview",
        )

        registration_fields = [
            {"id": str(rf.id), "label": rf.label, "field_key": rf.field_key}
            for rf in event.registration_fields.exclude(field_key__in={"name", "email", "phone_or_chat"})
        ]

        return Response(
            {
                "preview_id": str(ci.id),
                "headers": headers,
                "first_rows": rows,
                "auto_mapping": auto_detect(headers),
                "registration_fields": registration_fields,
            }
        )
```

- [ ] **Step 5: Add the URL route in `apps/guests/urls.py`**

Locate the `urlpatterns` list and add:

```python
from apps.guests.views import CsvImportPreviewView

urlpatterns += [
    path(
        "orgs/<slug:slug>/events/<slug:eventSlug>/imports/preview/",
        CsvImportPreviewView.as_view(),
        name="csv-import-preview",
    ),
]
```

(Match the existing route style. If the project namespaces under `api/v1/` at root urls and `apps/guests/urls.py` doesn't include the `orgs/<slug>/events/<eventSlug>/` prefix already, adjust the path string to match.)

- [ ] **Step 6: Verify the tests pass**

```bash
cd backend && uv run pytest tests/test_csv_preview.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/guests/services.py backend/apps/guests/views.py backend/apps/guests/urls.py backend/tests/test_csv_preview.py
git commit -m "feat(guests): CSV preview endpoint with auto-detect + 5MB cap"
```

---

## Task 7 — CSV commit endpoint

> `POST /api/v1/orgs/<slug>/events/<eventSlug>/imports/` — accepts `{preview_id, column_mapping}`, transitions the existing preview row to `pending` + enqueues `process_csv_import`.

**Files:**
- Modify: `backend/apps/guests/views.py` (add `CsvImportCommitView`)
- Modify: `backend/apps/guests/urls.py` (add route)
- Create: `backend/tests/test_csv_commit.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_csv_commit.py
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.models import CsvImport
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db, client):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="u@x.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="admin")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    client.force_login(user)
    ci = CsvImport.objects.create(
        event=ev,
        uploaded_by=user,
        file=SimpleUploadedFile("g.csv", b"Name,Email\nA,a@x.com\n"),
        column_mapping={},
        status="preview",
    )
    return client, org, ev, ci


@pytest.mark.django_db
@patch("apps.guests.views.process_csv_import_task")
class TestCsvCommit:
    def test_happy_path_transitions_and_enqueues(self, mock_task, setup):
        client, org, ev, ci = setup
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/",
            data={"preview_id": str(ci.id), "column_mapping": {"0": "name", "1": "email"}},
            content_type="application/json",
        )
        assert resp.status_code == 201, resp.json()
        ci.refresh_from_db()
        assert ci.status == "pending"
        assert ci.column_mapping == {"0": "name", "1": "email"}
        mock_task.delay.assert_called_once_with(import_id=str(ci.id))

    def test_invalid_preview_id_returns_404(self, mock_task, setup):
        client, org, ev, ci = setup
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/",
            data={"preview_id": "00000000-0000-0000-0000-000000000000", "column_mapping": {}},
            content_type="application/json",
        )
        assert resp.status_code == 404
        mock_task.delay.assert_not_called()

    def test_already_committed_preview_returns_409(self, mock_task, setup):
        client, org, ev, ci = setup
        ci.status = "pending"
        ci.save(update_fields=["status"])
        resp = client.post(
            f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/",
            data={"preview_id": str(ci.id), "column_mapping": {}},
            content_type="application/json",
        )
        assert resp.status_code == 409
        mock_task.delay.assert_not_called()
```

- [ ] **Step 2: Verify tests fail**

```bash
cd backend && uv run pytest tests/test_csv_commit.py -v
```

Expected: 404 on all tests.

- [ ] **Step 3: Add the view to `apps/guests/views.py`**

Append:

```python
from apps.guests.tasks import process_csv_import_task  # forward-declared in Task 8


class CsvImportCommitView(APIView):
    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]

    def post(self, request: Request, slug: str, eventSlug: str) -> Response:
        event = get_object_or_404(Event, organization__slug=slug, slug=eventSlug)
        self.check_object_permissions(request, event)

        preview_id = request.data.get("preview_id")
        mapping = request.data.get("column_mapping", {})
        if not isinstance(mapping, dict):
            return Response(
                {"detail": "column_mapping must be an object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ci = get_object_or_404(CsvImport, id=preview_id, event=event)
        if ci.status != "preview":
            return Response(
                {"detail": f"Import is already in status '{ci.status}'."},
                status=status.HTTP_409_CONFLICT,
            )

        ci.column_mapping = mapping
        ci.status = "pending"
        ci.save(update_fields=["column_mapping", "status"])

        process_csv_import_task.delay(import_id=str(ci.id))

        return Response(
            {
                "import_id": str(ci.id),
                "status": ci.status,
                "total_rows": ci.total_rows,
            },
            status=status.HTTP_201_CREATED,
        )
```

- [ ] **Step 4: Add the URL route**

In `apps/guests/urls.py`, append:

```python
from apps.guests.views import CsvImportCommitView

urlpatterns += [
    path(
        "orgs/<slug:slug>/events/<slug:eventSlug>/imports/",
        CsvImportCommitView.as_view(),
        name="csv-import-commit",
    ),
]
```

- [ ] **Step 5: Verify tests pass**

```bash
cd backend && uv run pytest tests/test_csv_commit.py -v
```

Expected: all 3 tests PASS.

> **Note:** `process_csv_import_task` is imported but not yet implemented — Task 8 implements it. The commit endpoint test mocks it.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/guests/views.py backend/apps/guests/urls.py backend/tests/test_csv_commit.py
git commit -m "feat(guests): CSV commit endpoint transitions preview row + enqueues task"
```

---

## Task 8 — `process_csv_import` task + status endpoint

> Celery task processes rows independently — valid rows insert via `register_guest(source="csv_import")`; invalid rows land in an error_report CSV. Status endpoint `GET /api/v1/orgs/<slug>/events/<eventSlug>/imports/<id>/` exposes progress for UI polling.

**Files:**
- Modify: `backend/apps/guests/tasks.py` (add `process_csv_import_task` + `sweep_preview_imports_task`)
- Modify: `backend/apps/guests/views.py` (add `CsvImportStatusView`)
- Modify: `backend/apps/guests/urls.py` (add status route)
- Modify: `backend/apps/guests/serializers.py` (add `CsvImportSerializer`)
- Create: `backend/tests/test_csv_import_task.py`
- Create: `backend/tests/test_csv_import_status.py`

- [ ] **Step 1: Write the failing task test**

```python
# backend/tests/test_csv_import_task.py
import csv
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from apps.audit.models import AuditEvent
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.guests.models import CsvImport, Guest
from apps.guests.tasks import process_csv_import_task
from apps.orgs.models import Organization


@pytest.fixture
def import_job(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="u@x.com", password="x")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    company_field = RegistrationField.objects.create(
        event=ev, field_key="company", label="Company", required=False
    )

    content = (
        "Name,Email,Phone,Company\n"
        "Alice,alice@x.com,+1,Acme\n"   # valid
        "Bob,bob@x.com,+2,Globex\n"     # valid
        ",charlie@x.com,+3,\n"           # invalid: missing required name
        "Diane,not-an-email,+4,\n"       # invalid: bad email
        "Alice,alice@x.com,+1,Acme\n"   # duplicate of row 1
    )
    f = SimpleUploadedFile("g.csv", content.encode("utf-8"))
    ci = CsvImport.objects.create(
        event=ev,
        uploaded_by=user,
        file=f,
        column_mapping={"0": "name", "1": "email", "2": "phone", "3": str(company_field.id)},
        status="pending",
    )
    return ci, ev, company_field


@pytest.mark.django_db
class TestProcessCsvImportTask:
    def test_processes_mixed_csv_correctly(self, import_job):
        ci, ev, company_field = import_job
        process_csv_import_task(import_id=str(ci.id))
        ci.refresh_from_db()
        assert ci.status == "complete"
        assert ci.total_rows == 5
        assert ci.imported_rows == 2
        assert ci.failed_rows == 3

        guests = Guest.objects.filter(event=ev, source="csv_import")
        assert guests.count() == 2
        alice = guests.get(email="alice@x.com")
        assert alice.full_name == "Alice"
        assert alice.custom_fields.get("company") == "Acme"

        # Audit rows emitted for each successful insert.
        assert AuditEvent.objects.filter(action="guest.created_via_csv").count() == 2

        # Error report exists and contains the 3 failed rows.
        assert ci.error_report
        ci.error_report.seek(0)
        reader = csv.reader(io.StringIO(ci.error_report.read().decode("utf-8")))
        rows = list(reader)
        assert rows[0] == ["row_number", "raw_data", "errors"]
        assert len(rows) == 4  # header + 3 failures
        # Row 4 is the duplicate (row_number=5 in original — header is row 1).
        assert any("Duplicate" in r[-1] for r in rows[1:])
```

- [ ] **Step 2: Verify it fails**

```bash
cd backend && uv run pytest tests/test_csv_import_task.py -v
```

Expected: `ImportError: cannot import name 'process_csv_import_task'`.

- [ ] **Step 3: Implement the task in `apps/guests/tasks.py`**

Append to the existing `tasks.py` (which already has `send_qr_email_task`):

```python
import csv as _csv
import io as _io
from datetime import timedelta

from celery import shared_task
from django.core.files.base import ContentFile
from django.utils import timezone

from apps.audit.services import emit
from apps.guests.models import CsvImport, Guest
from apps.guests.services import (
    PRESET_FIELDS,
    RegistrationError,
    register_guest,
)


@shared_task(name="guests.process_csv_import")
def process_csv_import_task(*, import_id: str) -> str:
    ci = CsvImport.objects.select_related("event__organization").get(id=import_id)
    if ci.status not in ("pending", "running"):
        return f"skipped:status_{ci.status}"

    ci.status = "running"
    ci.save(update_fields=["status"])

    # Inverse map: source field key -> column index. (column_mapping keys are str indices.)
    mapping: dict[str, int | str] = {}  # "name"/"email"/"phone"/<registration_field_id> -> int(col_index)
    for col_idx_str, target in (ci.column_mapping or {}).items():
        if target:
            mapping[str(target)] = int(col_idx_str)

    # Lookup any RegistrationField IDs we'll need.
    rf_map = {
        str(rf.id): rf.field_key
        for rf in ci.event.registration_fields.exclude(field_key__in=PRESET_FIELDS)
    }

    ci.file.seek(0)
    text = ci.file.read().decode("utf-8-sig")
    reader = _csv.reader(_io.StringIO(text))
    try:
        next(reader)  # skip header
    except StopIteration:
        ci.status = "failed"
        ci.save(update_fields=["status"])
        return "failed:empty"

    total = imported = failed = 0
    error_rows: list[list[str]] = [["row_number", "raw_data", "errors"]]

    for line_idx, row in enumerate(reader, start=2):  # header is row 1
        total += 1
        raw = ",".join(row)

        def col(key: str) -> str:
            idx = mapping.get(key)
            if idx is None or idx >= len(row):
                return ""
            return row[idx].strip()

        payload: dict[str, str] = {}
        if "name" in mapping:
            payload["name"] = col("name")
        if "email" in mapping:
            payload["email"] = col("email")
        if "phone" in mapping:
            payload["phone_or_chat"] = col("phone")
        for rf_id, field_key in rf_map.items():
            if rf_id in mapping:
                payload[field_key] = col(rf_id)

        # Duplicate check (email match within event).
        if payload.get("email") and Guest.objects.filter(
            event=ci.event, email=payload["email"]
        ).exists():
            failed += 1
            error_rows.append([str(line_idx), raw, "Duplicate: email already registered for this event"])
            continue

        try:
            guest = register_guest(event=ci.event, payload=payload, source="csv_import")
        except RegistrationError as exc:
            failed += 1
            error_rows.append([str(line_idx), raw, str(exc)])
            continue
        except Exception as exc:
            failed += 1
            error_rows.append([str(line_idx), raw, f"Unexpected error: {exc}"])
            continue
        imported += 1
        emit(
            organization=ci.event.organization,
            event=ci.event,
            guest=guest,
            actor_type="user",
            actor_id=str(ci.uploaded_by_id),
            action="guest.created_via_csv",
            result="success",
            entry_token=guest.entry_token,
            details={"csv_import_id": str(ci.id), "row_number": line_idx},
        )

    # Write the error report if any failures.
    if failed > 0:
        buf = _io.StringIO()
        _csv.writer(buf).writerows(error_rows)
        ci.error_report.save(
            f"errors-{ci.id}.csv",
            ContentFile(buf.getvalue().encode("utf-8")),
            save=False,
        )

    ci.total_rows = total
    ci.imported_rows = imported
    ci.failed_rows = failed
    ci.status = "complete"
    ci.completed_at = timezone.now()
    ci.save(update_fields=["total_rows", "imported_rows", "failed_rows", "status", "completed_at", "error_report"])

    return f"complete:{imported}/{total}"


@shared_task(name="guests.sweep_preview_imports")
def sweep_preview_imports_task() -> str:
    """Periodic: delete CsvImport rows stuck in 'preview' status for >24h."""
    cutoff = timezone.now() - timedelta(hours=24)
    qs = CsvImport.objects.filter(status="preview", created_at__lt=cutoff)
    count = qs.count()
    qs.delete()
    return f"swept:{count}"
```

- [ ] **Step 4: Verify the task test passes**

```bash
cd backend && uv run pytest tests/test_csv_import_task.py -v
```

Expected: PASS.

- [ ] **Step 5: Write the status endpoint test**

```python
# backend/tests/test_csv_import_status.py
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.models import CsvImport
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def status_ready(db, client):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="u@x.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="admin")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    client.force_login(user)
    ci = CsvImport.objects.create(
        event=ev,
        uploaded_by=user,
        file=SimpleUploadedFile("g.csv", b"Name,Email\nA,a@x.com\n"),
        column_mapping={"0": "name", "1": "email"},
        status="running",
        total_rows=10,
        imported_rows=7,
        failed_rows=2,
    )
    return client, org, ev, ci


@pytest.mark.django_db
class TestCsvImportStatus:
    def test_get_returns_progress(self, status_ready):
        client, org, ev, ci = status_ready
        resp = client.get(f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/{ci.id}/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "running"
        assert body["total_rows"] == 10
        assert body["imported_rows"] == 7
        assert body["failed_rows"] == 2
        assert body["error_report_url"] is None  # not set yet

    def test_get_includes_error_report_url_when_set(self, status_ready):
        from django.core.files.base import ContentFile

        client, org, ev, ci = status_ready
        ci.error_report.save("err.csv", ContentFile(b"row_number,errors\n2,bad\n"))
        resp = client.get(f"/api/v1/orgs/{org.slug}/events/{ev.slug}/imports/{ci.id}/")
        assert resp.status_code == 200
        assert resp.json()["error_report_url"] is not None
```

- [ ] **Step 6: Verify it fails**

```bash
cd backend && uv run pytest tests/test_csv_import_status.py -v
```

Expected: 404.

- [ ] **Step 7: Add the serializer + view**

In `apps/guests/serializers.py`, append:

```python
from apps.guests.models import CsvImport


class CsvImportSerializer(serializers.ModelSerializer):
    error_report_url = serializers.SerializerMethodField()

    class Meta:
        model = CsvImport
        fields = [
            "id",
            "status",
            "total_rows",
            "imported_rows",
            "failed_rows",
            "error_report_url",
            "created_at",
            "completed_at",
        ]

    def get_error_report_url(self, obj) -> str | None:
        if not obj.error_report:
            return None
        request = self.context.get("request")
        url = obj.error_report.url
        return request.build_absolute_uri(url) if request else url
```

In `apps/guests/views.py`, append:

```python
from apps.guests.serializers import CsvImportSerializer


class CsvImportStatusView(APIView):
    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]

    def get(self, request: Request, slug: str, eventSlug: str, import_id: str) -> Response:
        event = get_object_or_404(Event, organization__slug=slug, slug=eventSlug)
        self.check_object_permissions(request, event)
        ci = get_object_or_404(CsvImport, id=import_id, event=event)
        return Response(CsvImportSerializer(ci, context={"request": request}).data)
```

In `apps/guests/urls.py`, append:

```python
from apps.guests.views import CsvImportStatusView

urlpatterns += [
    path(
        "orgs/<slug:slug>/events/<slug:eventSlug>/imports/<uuid:import_id>/",
        CsvImportStatusView.as_view(),
        name="csv-import-status",
    ),
]
```

- [ ] **Step 8: Verify the status test passes**

```bash
cd backend && uv run pytest tests/test_csv_import_status.py tests/test_csv_import_task.py -v
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/guests/tasks.py backend/apps/guests/views.py backend/apps/guests/urls.py backend/apps/guests/serializers.py backend/tests/test_csv_import_task.py backend/tests/test_csv_import_status.py
git commit -m "feat(guests): process_csv_import task + status endpoint + sweep task"
```

---

## Task 9 — CSV upload dialog + preview UI (frontend)

> Installs shadcn `dialog`. Builds the CSV import dialog with file input, preview table, and column-mapping dropdowns. Wires "Import CSV" button into the guests page.

**Files:**
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/page.tsx` (add Import button + dialog mount)
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx`
- Create: `frontend/lib/csv-imports.ts`
- Create: `frontend/components/ui/dialog.tsx` (via `npx shadcn add dialog`)

- [ ] **Step 1: Install shadcn dialog**

```bash
cd frontend && pnpm dlx shadcn@latest add dialog
```

Expected: `frontend/components/ui/dialog.tsx` created. Pnpm-lock + package.json may pick up `@radix-ui/react-dialog` if not already present.

- [ ] **Step 2: Add the API client `frontend/lib/csv-imports.ts`**

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type RegistrationFieldRef = { id: string; label: string; field_key: string };

export type PreviewResponse = {
  preview_id: string;
  headers: string[];
  first_rows: string[][];
  auto_mapping: Record<string, string | null>;
  registration_fields: RegistrationFieldRef[];
};

export type ImportStatus = {
  id: string;
  status: "preview" | "pending" | "running" | "complete" | "failed";
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  error_report_url: string | null;
  created_at: string;
  completed_at: string | null;
};

export function usePreviewMutation(orgSlug: string, eventSlug: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<PreviewResponse> => {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/imports/preview/`,
        { method: "POST", credentials: "include", body: form },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({ detail: `${r.status}` }));
        throw new Error(body.detail ?? `${r.status}`);
      }
      return (await r.json()) as PreviewResponse;
    },
  });
}

export function useCommitMutation(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      preview_id: string;
      column_mapping: Record<string, string | null>;
    }): Promise<{ import_id: string; status: string; total_rows: number }> => {
      const r = await fetch(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/imports/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return await r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["guests", orgSlug, eventSlug] });
    },
  });
}

export function useImportStatus(orgSlug: string, eventSlug: string, importId: string | null) {
  return useQuery<ImportStatus>({
    queryKey: ["csv-import", orgSlug, eventSlug, importId],
    queryFn: async () => {
      const r = await fetch(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/imports/${importId}/`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`${r.status}`);
      return (await r.json()) as ImportStatus;
    },
    enabled: !!importId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "complete" || s === "failed" ? false : 2000;
    },
  });
}
```

- [ ] **Step 3: Build the dialog component**

```tsx
// frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  type PreviewResponse,
  useCommitMutation,
  usePreviewMutation,
} from "@/lib/csv-imports";

type Target = "name" | "email" | "phone" | string | null; // string = registration_field.id

export function CsvImportDialog({
  orgSlug,
  eventSlug,
}: {
  orgSlug: string;
  eventSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, Target>>({});
  const previewMut = usePreviewMutation(orgSlug, eventSlug);
  const commitMut = useCommitMutation(orgSlug, eventSlug);

  const onFile = async (file: File) => {
    const p = await previewMut.mutateAsync(file);
    setPreview(p);
    setMapping(p.auto_mapping as Record<string, Target>);
  };

  const onCommit = async () => {
    if (!preview) return;
    await commitMut.mutateAsync({ preview_id: preview.preview_id, column_mapping: mapping });
    setOpen(false);
    setPreview(null);
    setMapping({});
  };

  const targetOptions = (autoLabel: string | undefined) => {
    const opts: { value: string; label: string }[] = [
      { value: "", label: "Skip" },
      { value: "name", label: "Name" },
      { value: "email", label: "Email" },
      { value: "phone", label: "Phone" },
    ];
    if (preview) {
      for (const rf of preview.registration_fields) {
        opts.push({ value: rf.id, label: rf.label });
      }
    }
    return opts;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import guests from CSV</DialogTitle>
        </DialogHeader>

        {!preview && (
          <div className="space-y-4">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
              className="block w-full text-sm"
            />
            {previewMut.isError && (
              <p className="text-sm text-red-600">{(previewMut.error as Error).message}</p>
            )}
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  {preview.headers.map((h, i) => {
                    const auto = preview.auto_mapping[String(i)] ?? "";
                    return (
                      <th key={i} className="py-2 pr-3 align-top">
                        <div className="font-medium">{h}</div>
                        <select
                          className="mt-1 rounded border px-1 py-0.5 text-[0.7rem]"
                          value={mapping[String(i)] ?? ""}
                          onChange={(e) =>
                            setMapping((m) => ({
                              ...m,
                              [String(i)]: e.target.value === "" ? null : e.target.value,
                            }))
                          }
                        >
                          {targetOptions(auto).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                              {auto && o.value === auto ? " (auto)" : ""}
                            </option>
                          ))}
                        </select>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {preview.first_rows.map((row, ri) => (
                  <tr key={ri} className="border-b">
                    {row.map((cell, ci) => (
                      <td key={ci} className="py-1 pr-3 font-mono">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
                Choose another file
              </Button>
              <Button size="sm" onClick={onCommit} disabled={commitMut.isPending}>
                {commitMut.isPending ? "Importing…" : "Import"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Mount the dialog in the guests page**

In `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/page.tsx`, locate the page-level header area (next to existing filter / action buttons) and add:

```tsx
import { CsvImportDialog } from "./_components/csv-import-dialog";

// inside the JSX header row, alongside whatever filter/action buttons exist:
<CsvImportDialog orgSlug={slug} eventSlug={eventSlug} />
```

(If the page currently has no header, add one above the table. The dialog itself manages all its own state — the only prop is the org/event slug.)

- [ ] **Step 5: Verify checks**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check && pnpm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ui/dialog.tsx frontend/lib/csv-imports.ts 'frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/_components/csv-import-dialog.tsx' 'frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/page.tsx' frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(guests): CSV import dialog with preview + column mapping"
```

---

## Task 10 — Import status page with polling

> Standalone page at `/orgs/<slug>/events/<eventSlug>/imports/<id>` that polls the status endpoint every 2 s and renders progress + error-report download.

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useImportStatus } from "@/lib/csv-imports";

export default function ImportDetailPage() {
  const { slug, eventSlug, id } = useParams<{
    slug: string;
    eventSlug: string;
    id: string;
  }>();
  const { data, isLoading } = useImportStatus(slug, eventSlug, id);

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const pct =
    data.total_rows > 0
      ? Math.round(((data.imported_rows + data.failed_rows) / data.total_rows) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Import {data.id.slice(0, 8)}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base capitalize">{data.status}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
              aria-label={`${pct}%`}
            />
          </div>
          <p>
            Imported {data.imported_rows} / {data.total_rows}. {data.failed_rows} failed.
          </p>
          {data.status === "complete" && data.error_report_url && (
            <p>
              <a
                href={data.error_report_url}
                className="text-primary underline"
                download
              >
                Download error report
              </a>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify checks**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check && pnpm test
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add 'frontend/app/(app)/orgs/[slug]/events/[eventSlug]/imports/[id]/page.tsx'
git commit -m "feat(guests): import detail page with polling progress + error report"
```

---

## Task 11 — "Get on Telegram" CTA on confirmation page + email template

> Adds the Telegram deep-link button to the registration confirmation page (frontend) and the email body (backend). Both render only when their respective `TELEGRAM_BOT_USERNAME` env is set; absent env = feature gracefully off.

**Files:**
- Modify: `frontend/app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx`
- Modify: `frontend/.env.example` (add `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`)
- Modify: `backend/apps/guests/tasks.py::send_qr_email_task` body (append the Telegram CTA)
- Modify: `backend/tests/test_qr_email_task.py` (assert the link appears when env set)

- [ ] **Step 1: Add the env stub**

In `frontend/.env.example`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
```

- [ ] **Step 2: Add the CTA on the confirmation page**

In `frontend/app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx`, find the existing CTA region (likely a card containing "Open QR" or similar). Add directly after the existing primary CTA:

```tsx
{process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME && (
  <a
    href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=${guest.entry_token}`}
    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
    target="_blank"
    rel="noopener noreferrer"
  >
    Get on Telegram
  </a>
)}
```

(`guest` is the prop or fetched object in the existing page; substitute the actual variable name used by that page.)

- [ ] **Step 3: Verify frontend checks**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check && pnpm test
```

Expected: all green.

- [ ] **Step 4: Add the failing backend test**

In `backend/tests/test_qr_email_task.py`, append:

```python
@pytest.mark.django_db
def test_email_body_includes_telegram_link_when_bot_username_set(event, settings):
    from django.core import mail

    settings.TELEGRAM_BOT_USERNAME = "EventgateBot"
    mail.outbox.clear()
    guest = register_guest(
        event=event,
        payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
    )
    msg = mail.outbox[0]
    assert f"https://t.me/EventgateBot?start={guest.entry_token}" in msg.body


@pytest.mark.django_db
def test_email_body_omits_telegram_link_when_bot_username_blank(event, settings):
    from django.core import mail

    settings.TELEGRAM_BOT_USERNAME = ""
    mail.outbox.clear()
    register_guest(
        event=event,
        payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
    )
    msg = mail.outbox[0]
    assert "t.me/" not in msg.body
```

- [ ] **Step 5: Verify the new tests fail**

```bash
cd backend && uv run pytest tests/test_qr_email_task.py -v
```

Expected: 2 new tests FAIL (link absent / present mismatch).

- [ ] **Step 6: Modify `send_qr_email_task` body**

In `backend/apps/guests/tasks.py`, find the `body = (...)` block inside `send_qr_email_task`. Replace it with:

```python
        telegram_line = ""
        bot_username = getattr(settings, "TELEGRAM_BOT_USERNAME", "")
        if bot_username:
            telegram_line = (
                f"\n\nPrefer Telegram? Tap here to receive your QR via @{bot_username}: "
                f"https://t.me/{bot_username}?start={guest.entry_token}"
            )
        body = (
            f"Hi {guest.full_name or 'there'},\n\n"
            f"You're registered for {guest.event.name}.\n\n"
            "Show the attached QR code at the entrance — staff will scan it.\n"
            "Keep it private; do not share."
            f"{telegram_line}\n\n"
            "See you there!\n"
            "— Eventgate"
        )
```

- [ ] **Step 7: Verify backend tests pass**

```bash
cd backend && uv run pytest tests/test_qr_email_task.py -v
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add 'frontend/app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx' frontend/.env.example backend/apps/guests/tasks.py backend/tests/test_qr_email_task.py
git commit -m "feat(notifications): Telegram CTA on confirmation page + email body"
```

---

## Task 12 — Verification checklist doc

> Stand-alone verification checklist the user runs manually after the wave merges. Mirrors Plan F's verification checklist shape.

**Files:**
- Create: `docs/plans/2026-05-22-plan-g-verification-checklist.md`

- [ ] **Step 1: Write the doc**

```markdown
# Plan G verification checklist

> **Time budget:** ~45 min. Section 0 (~5 min) is pre-flight. Section 1 (~10 min) is backend smoke. Sections 2–3 (~20 min) are the headline UI flows. Section 4 (~10 min) is regression smoke.

## Section 0 — Pre-flight

- [ ] **Local main matches origin/main**

  ```bash
  cd /Users/vinei/Projects/eventgate
  git fetch origin --quiet
  git log --oneline main..origin/main  # expect: empty
  ```

- [ ] **Backend tests pass**

  ```bash
  docker compose up -d
  cd backend && uv run pytest -q
  # Expect: all tests pass (target ~240+ after Plan G).
  ```

- [ ] **Frontend gates pass**

  ```bash
  cd frontend && pnpm install --frozen-lockfile && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check
  # Expect: tests pass, no type errors, no lint warnings, no format issues.
  ```

- [ ] **Telegram env vars present (staging / pilot env only — local dev can skip)**

  - `TELEGRAM_BOT_TOKEN` (fly secret) — the bot's API token.
  - `TELEGRAM_BOT_USERNAME` (fly secret + frontend `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`) — bot's @handle minus the @.
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
  curl -sS -X POST -w "%{http_code}\n" \
    "https://<staging>/api/v1/orgs/<slug>/events/<event-slug>/imports/preview/" \
    -H "Cookie: eventgate_access=$ACCESS_COOKIE" \
    -F "file=@/tmp/empty.csv" -o /tmp/out
  ```

- [ ] **Telegram webhook rejects wrong secret** (expect 200 + no-op):

  ```bash
  curl -sS -X POST -w "%{http_code}\n" \
    "https://<staging>/api/v1/telegram/webhook/" \
    -H "X-Telegram-Bot-Api-Secret-Token: wrong" \
    -H "Content-Type: application/json" \
    --data '{"update_id":1,"message":{"chat":{"id":42},"text":"/start nope","from":{"username":"x"}}}'
  ```

  Expect: `200`. Then check the staging logs — no warnings beyond "telegram_webhook: secret mismatch", no TelegramBinding row created.

## Section 2 — Telegram bot end-to-end

> Requires a real test bot in the staging env, with `TELEGRAM_BOT_USERNAME=EventgateStagingBot` (or similar) set.

- [ ] **Register a guest** via the public registration page (`/(public)/e/<orgSlug>/<eventSlug>/register`). Note their `entry_token`.

- [ ] **Confirmation page shows the "Get on Telegram" CTA.** (If absent, check `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is baked into the Vercel build.)

- [ ] **Tap "Get on Telegram"** → Telegram opens → bot greets → QR PNG arrives within ~5 seconds.

- [ ] **Verify the binding row:**

  ```bash
  curl -sS \
    "https://<staging>/api/v1/orgs/<slug>/events/<event-slug>/audit/?action_prefix=notifications." \
    -H "Cookie: eventgate_access=$ACCESS_COOKIE" | python3 -m json.tool | head -40
  ```

  Expect: `notifications.telegram_bound` audit row + `notifications.telegram_sent` audit row.

- [ ] **Send any other message to the bot** (e.g., "hi") → bot replies with the generic message ("Hi! To receive your QR code…").

- [ ] **Send `/start <invalid_token>`** to the bot → bot replies with the "no longer valid" message. Verify a `notifications.telegram_unknown_start` audit row exists.

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

- [ ] **Preview correctly auto-maps** Name, Email, Phone with "(auto)" badges. Click Import.

- [ ] **Status page shows** progress, then `Imported 3 / 5. 2 failed.`. Download the error report — verify rows 4 and 5 (1-indexed excluding header) appear with the right error messages.

- [ ] **Audit log** at `/orgs/<slug>/events/<event-slug>/audit?action_prefix=guest.` shows 3 × `guest.created_via_csv` rows.

- [ ] **Re-upload the same file** — preview succeeds, but on commit each previously-imported row gets flagged as "Duplicate: email already registered for this event" in the new error report.

## Section 4 — Regression smoke

- [ ] **Existing Plan F flows still work:** helpdesk inbox loads with the migrated TanStack hooks (`/orgs/<slug>/events/<event-slug>/helpdesk`); audit page expandable rows still toggle; dashboard polling widget still updates.

- [ ] **Email QR still arrives** for a registered guest (with `TELEGRAM_BOT_USERNAME` set, the email now also contains the Telegram CTA link).

- [ ] **Pre-commit hook** catches a deliberate format violation (Task 0b's hook still works post-Plan-G).

## Acceptance criteria

- All Section 0–3 boxes ticked.
- No new Sentry errors during the Section 2 / 3 walkthroughs.
- The `notifications.telegram_*` audit prefix and `guest.created_via_csv` audit action both appear in the audit viewer.
```

- [ ] **Step 2: Verify prettier**

```bash
cd frontend && pnpm prettier --check ../docs/plans/2026-05-22-plan-g-verification-checklist.md
```

If not clean: `pnpm prettier --write ../docs/plans/2026-05-22-plan-g-verification-checklist.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-05-22-plan-g-verification-checklist.md
git commit -m "docs(plan-g): verification checklist (Telegram + CSV)"
```
