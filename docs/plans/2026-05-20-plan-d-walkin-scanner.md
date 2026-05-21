# Plan D — Walk-in Flow + Pre-registered Scanner PWA + Celery Worker + Public Event Detail

> **For agentic workers:** TDD discipline applies to every backend task (red → green → commit). Each task has `- [ ]` checkboxes for tracking. Backend tasks are sized for the Agent tool (general-purpose, sonnet) with the full task body inlined; frontend + deploy tasks are inline-controller work.

**Goal:** Close the door-day loop. After Plan D, an organizer can mint a scanner device + event PIN, a staffer can unlock that device at the door, scan a pre-registered guest's QR and check them in online, run a walk-in QR display on a second tablet, and capture walk-in info inside the hall. Plus: a public event-detail endpoint so the registration page shows the real event name, and a real Celery worker process on Fly so we can stop running tasks eagerly inside the web request.

This is **Plan D of an 8-plan Phase 1 sequence** (see `docs/brief.md` §12 W7–8). Offline scanner sync (service worker + IndexedDB + sync queue) is Plan E. Help desk + audit viewer + dashboard polling is Plan F.

**Architecture:**
- `apps.audit` — **new skeleton.** One `AuditEvent` model. Append-only writes via a tiny helper; the UI viewer lands in Plan F, but check-in/claim writes need an audit sink now.
- `apps.devices` — **new app.** `ScannerDevice` (org-scoped, event-scoped, role in `scanner`/`walkin_display`/`helpdesk`, `device_token_hash`) + `EventPinSession` (short-lived per-device unlock). Issues + validates **device tokens** (the long-lived per-device credential) and **session tokens** (the short-lived PIN-unlock receipt that authorizes mutating endpoints).
- `apps.checkins` — **new app.** One hot-path endpoint: `POST /api/v1/checkins/`. Validates `(token, device_session, event_match)`, takes `pg_advisory_xact_lock(hashtext(entry_token))` inside a transaction, runs the transition through `apps.guests.transitions`, writes an `AuditEvent`, returns the result. Idempotent via `client_idempotency_key` stored in Redis with 24h TTL.
- `apps.walkins` — **new app.** Three endpoints:
  - `POST /api/v1/walkins/displays/next/` — scanner-authenticated (walk-in display device). Returns the current `displayed` walk-in for (event, gate, scanner) or mints a new one and persists it before responding. Honors the partial unique index `one_displayed_walkin_per_scope`.
  - `POST /api/v1/e/<org>/<event>/claim/<token>/` — **public.** Guest hits this from the displayed QR's URL. Transitions `displayed → checked_in + claimed_pending_info`. Idempotent — claiming twice returns the existing claim, never a 4xx.
  - `POST /api/v1/e/<org>/<event>/info/<token>/` — **public.** Submits the inside-hall info form. Transitions `claimed_pending_info → info_completed`.
- `apps.guests.transitions` — **new module.** Single source of truth for valid `entry_status` / `info_status` moves, mirrors the MVP's `TokenService.validateTransition()`. Both `checkins.views` and `walkins.views` go through it.
- **Event PIN** — set + rotate on the existing `Event` model via two new endpoints (`POST /api/v1/orgs/<org>/events/<slug>/pin/set/`, `POST /api/v1/orgs/<org>/events/<slug>/pin/rotate/`). Stored as bcrypt in the existing `event_pin_hash` column (already in the schema). Owner/admin only.
- **Public event detail** — `GET /api/v1/e/<org>/<event>/` returns `{name, slug, registration_open, walkins_enabled, status, fields: [{field_key, label_en, label_km, field_type, required, options}]}`. Anonymous. Lets the public registration page render the real event name + dynamic fields (no more slug-as-title fallback from Plan C).
- **Walk-in QR encodes a URL**, not a raw token (brief Decision Q11). Format: `https://<host>/e/<org>/<event>/claim/<token>`. Pre-reg QR stays raw-token-only (Appendix A).
- **Celery worker on Fly** — `fly.toml` gets a `[[processes]]` block declaring `app` (gunicorn) and `worker` (celery). `flyctl scale count app=1 worker=1`. `CELERY_TASK_ALWAYS_EAGER` Fly secret unset so tasks ride the queue.
- **Scanner PWA** lives at `frontend/app/(scanner)/`. Plan D keeps it **online-only**: real service worker registration + manifest + install-prompt scaffolding land here, but the SW only caches static assets. The IndexedDB cache + sync queue is Plan E. Camera uses `BarcodeDetector` with a manual-entry fallback for browsers that lack it.

**Tech Stack:**
- Backend: existing Django 5 + DRF + Postgres + Redis + Celery. New runtime deps: `bcrypt>=4.0,<5.0` for PIN hashing (already in `passlib` transitively but lock it explicitly). No new heavy deps.
- Frontend: existing Next.js 16 + React 19 + Tailwind v4 + shadcn/ui + next-intl. New deps: `next-pwa@^5.6` (or hand-rolled — chosen below: hand-rolled to keep Plan E's Workbox migration clean).
- Deploy: existing Fly + Vercel + Neon + Upstash Redis. New: a worker process group on Fly.

**Builds on:** Plans A/B/C. Repo at `github.com/vineidev/eventgate`. Backend on Fly Singapore (`eventgate-backend-staging`). Frontend on Vercel (`frontend-five-lovat-94`).

---

## File Structure

```text
backend/
├── apps/
│   ├── audit/                          ← NEW APP
│   │   ├── __init__.py / apps.py
│   │   ├── models.py                   ← AuditEvent
│   │   ├── services.py                 ← write_audit() helper
│   │   ├── admin.py
│   │   └── migrations/
│   ├── devices/                        ← NEW APP
│   │   ├── __init__.py / apps.py
│   │   ├── models.py                   ← ScannerDevice, EventPinSession
│   │   ├── auth.py                     ← DeviceTokenAuthentication, SessionTokenAuthentication
│   │   ├── services.py                 ← create_device(), complete_enrollment(), unlock_with_pin()
│   │   ├── serializers.py
│   │   ├── views.py                    ← organizer device CRUD + device-side enroll/unlock endpoints
│   │   ├── urls.py
│   │   ├── admin.py
│   │   └── migrations/
│   ├── checkins/                       ← NEW APP
│   │   ├── __init__.py / apps.py
│   │   ├── services.py                 ← perform_checkin() (advisory lock + transition + audit)
│   │   ├── views.py                    ← CheckinView (POST)
│   │   ├── urls.py
│   │   └── migrations/                 ← empty; no models, just for app config
│   ├── walkins/                        ← NEW APP
│   │   ├── __init__.py / apps.py
│   │   ├── services.py                 ← get_or_create_displayed(), claim_walkin(), complete_walkin_info()
│   │   ├── serializers.py
│   │   ├── views.py                    ← display-next, public claim, public info
│   │   ├── urls.py
│   │   └── migrations/                 ← partial unique index for displayed walkins
│   ├── events/
│   │   ├── views.py                    ← MODIFY: add PIN set/rotate + PublicEventDetailView
│   │   ├── urls.py                     ← MODIFY: wire the three new routes
│   │   └── services.py                 ← MODIFY: add set_event_pin(), check_event_pin()
│   ├── guests/
│   │   └── transitions.py              ← NEW: TransitionValidator
│   └── common/
│       └── locks.py                    ← NEW: with_token_advisory_lock() helper
├── config/
│   ├── settings/
│   │   └── base.py                     ← MODIFY: add audit/devices/checkins/walkins apps
│   └── urls.py                         ← MODIFY: include the four new url modules
├── fly.toml                            ← MODIFY: declare app + worker process groups
├── Procfile                            ← NEW (or update existing): web + worker commands
└── tests/
    ├── test_audit_model.py
    ├── test_event_pin.py
    ├── test_devices_models.py
    ├── test_devices_enrollment.py
    ├── test_devices_pin_unlock.py
    ├── test_device_auth.py
    ├── test_transitions.py
    ├── test_checkin_happy.py
    ├── test_checkin_idempotent.py
    ├── test_checkin_concurrency.py
    ├── test_walkin_display_next.py
    ├── test_walkin_claim.py
    ├── test_walkin_info.py
    └── test_public_event_detail.py

frontend/
├── app/
│   ├── (public)/
│   │   └── e/[orgSlug]/[eventSlug]/
│   │       ├── claim/[token]/page.tsx          ← NEW: walk-in claim confirmation
│   │       ├── info/[token]/page.tsx           ← NEW: post-entry info form
│   │       └── register/page.tsx               ← MODIFY: render real event name + dynamic fields
│   ├── (app)/orgs/[slug]/events/[slug]/
│   │   ├── devices/page.tsx                    ← NEW: device list + create + revoke
│   │   └── settings/page.tsx                   ← NEW: event PIN set/rotate
│   ├── (scanner)/                              ← NEW ROUTE GROUP
│   │   ├── layout.tsx                          ← shared shell + offline-aware header
│   │   ├── enroll/page.tsx                     ← paste enrollment code
│   │   ├── unlock/page.tsx                     ← event PIN entry
│   │   ├── scan/page.tsx                       ← camera + token validate + checkin mutation
│   │   └── walkin/page.tsx                     ← walk-in QR display loop
│   ├── manifest.ts                             ← NEW: PWA manifest (Next.js convention)
│   ├── sw.ts → /public/sw.js                   ← NEW: minimal service worker (static caching only; Plan E adds offline data sync)
│   └── middleware.ts                           ← MODIFY: add /scanner/* to public matcher (device auth, not user JWT)
├── lib/
│   ├── devices.ts                              ← NEW: API hooks for device + PIN + session
│   ├── scanner/
│   │   ├── camera.ts                           ← NEW: BarcodeDetector wrapper + fallback
│   │   ├── session.ts                          ← NEW: localStorage device/session token helpers
│   │   └── api.ts                              ← NEW: checkin + walkin display fetchers
│   ├── walkins.ts                              ← NEW: public claim + info API hooks
│   ├── events.ts                               ← MODIFY: add usePublicEventDetail
│   └── i18n/messages/
│       ├── en.json                             ← MODIFY: add scanner + walkin keys
│       └── km.json                             ← MODIFY: add scanner + walkin keys (machine-quality; review pending)
├── components/
│   ├── scanner/
│   │   ├── camera-view.tsx                     ← live camera feed + scan loop
│   │   ├── result-card.tsx                     ← full-screen success/duplicate/invalid card
│   │   ├── manual-token-entry.tsx              ← fallback when BarcodeDetector missing
│   │   ├── walkin-display.tsx                  ← large QR + "next" trigger
│   │   ├── pin-entry.tsx
│   │   └── enrollment-form.tsx
│   ├── walkins/
│   │   ├── claim-confirmation.tsx              ← "ENTRY CONFIRMED" hero
│   │   └── info-form.tsx                       ← reuses dynamic-field renderer
│   └── events/
│       ├── device-table.tsx                    ← list + revoke
│       ├── device-create-dialog.tsx
│       └── pin-management-card.tsx
└── public/
    ├── sw.js                                   ← compiled output of app/sw.ts (committed; Plan E moves to Workbox)
    └── icons/                                  ← NEW: PWA icons (192, 512, maskable)
```

**Boundary notes:**
- `apps.guests.transitions` is **the** transition validator. Direct ORM updates of `entry_status` / `info_status` outside of `transitions.apply_transition(guest, to=...)` are linted via integration test (`tests/test_transitions.py::test_direct_status_writes_are_grep_clean`).
- `apps.checkins` has **no models**. It's a thin services + view + url module. State lives in `Guest`, audit in `AuditEvent`, idempotency in Redis.
- `apps.walkins.services` is the only place that creates walk-in `Guest` rows. The display endpoint mints them; the public root URL never does (preserves the Appendix A rule "public root is registration only").
- `apps.devices.auth.DeviceTokenAuthentication` validates `Authorization: Device <raw_device_token>` and sets `request.scanner_device`. `SessionTokenAuthentication` validates `Authorization: Bearer <session_token>` against an unexpired `EventPinSession` and sets `request.scanner_device` + `request.scanner_session`. Mutating scanner endpoints (`checkin`, `walkin display next`) require `SessionTokenAuthentication`. Enrollment + PIN-unlock require `DeviceTokenAuthentication`.
- `apps.audit.services.write_audit(...)` is the **only** sanctioned writer. It uses a `_audit_writer` connection with `transaction.atomic()`; an append-only DB trigger (REVOKE UPDATE/DELETE) is deferred to Plan F when the viewer ships.
- Frontend `(scanner)` route group runs without JWT user auth — it carries its own `Authorization: Device …` / `Authorization: Bearer …` headers in app code. `middleware.ts` is updated to skip `/scanner/*` from the auth redirect.
- The minimal service worker (`public/sw.js`) only caches Next.js static chunks + the PWA manifest + app icons. **It does NOT cache API responses or guest data.** Plan E replaces it with Workbox + Dexie.

---

## Task 1: Register the four new apps + add bcrypt dep

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/config/settings/base.py`
- Create skeletons: `backend/apps/audit/{__init__.py,apps.py}`, same for `devices`, `checkins`, `walkins`

- [x] **Step 1: Add bcrypt dep**

In `/Users/vinei/Projects/eventgate/backend/pyproject.toml`, append to `dependencies`:

```toml
  "bcrypt>=4.0,<5.0",
```

- [x] **Step 2: Sync**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv sync
```

Expected: `bcrypt` added to lockfile, no other diffs.

- [x] **Step 3: Create app skeletons**

For each of `audit`, `devices`, `checkins`, `walkins`, create `backend/apps/<name>/__init__.py` (empty) and `backend/apps/<name>/apps.py` containing:

```python
from django.apps import AppConfig


class <Camel>Config(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.<name>"
```

- [x] **Step 4: Wire into INSTALLED_APPS**

In `/Users/vinei/Projects/eventgate/backend/config/settings/base.py`, replace the `INSTALLED_APPS` block:

```python
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "anymail",
    "apps.common",
    "apps.accounts",
    "apps.orgs",
    "apps.notifications",
    "apps.events",
    "apps.guests",
    "apps.audit",
    "apps.devices",
    "apps.checkins",
    "apps.walkins",
]
```

- [x] **Step 5: Confirm Django boots**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run python manage.py check --settings=config.settings.test
```

Expected: `System check identified no issues (0 silenced).`

- [x] **Step 6: Commit**

```bash
git add backend/ && git commit -m "feat(apps): scaffold audit, devices, checkins, walkins apps"
```

---

## Task 2: `apps.audit.AuditEvent` model + `write_audit()` helper

**TDD.** Write the test first; expect failures.

**Files:**
- Create: `backend/apps/audit/models.py`
- Create: `backend/apps/audit/services.py`
- Create: `backend/apps/audit/admin.py`
- Create: `backend/tests/test_audit_model.py`

- [x] **Step 1: Test file**

`/Users/vinei/Projects/eventgate/backend/tests/test_audit_model.py`:

```python
import pytest
from django.contrib.auth import get_user_model

from apps.audit.models import AuditEvent
from apps.audit.services import write_audit
from apps.events.models import Event
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _org():
    return Organization.objects.create(name="O", slug="o")


def _event(org):
    return Event.objects.create(organization=org, name="E", slug="e")


def test_write_audit_creates_row():
    org = _org()
    ev = _event(org)
    row = write_audit(
        organization=org,
        event=ev,
        actor_type="system",
        actor_id="system",
        action="checkin.success",
        result="success",
        previous_status="registered_not_arrived",
        new_status="checked_in",
        gate="Gate 1",
        scanner="Lane A",
        details={"client_idempotency_key": "abc"},
    )
    assert AuditEvent.objects.count() == 1
    assert row.action == "checkin.success"
    assert row.organization_id == org.id
    assert row.event_id == ev.id
    assert row.details_json == {"client_idempotency_key": "abc"}


def test_audit_action_required():
    org = _org()
    ev = _event(org)
    with pytest.raises(ValueError):
        write_audit(organization=org, event=ev, actor_type="system", actor_id="x", action="", result="success")


def test_audit_result_choices():
    org = _org()
    ev = _event(org)
    with pytest.raises(ValueError):
        write_audit(organization=org, event=ev, actor_type="system", actor_id="x", action="x", result="bogus")
```

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest tests/test_audit_model.py
```

Expected: `ModuleNotFoundError: No module named 'apps.audit.models'`.

- [x] **Step 2: Model**

`/Users/vinei/Projects/eventgate/backend/apps/audit/models.py`:

```python
from __future__ import annotations

import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone as tz


class AuditEvent(models.Model):
    """Append-only audit row. write_audit() is the only sanctioned writer.

    A DB-level trigger to REVOKE UPDATE/DELETE is deferred to Plan F when the
    viewer UI lands; until then, app-layer discipline + grep-clean assertion.
    """

    ACTOR_TYPES = (
        ("user", "User"),
        ("scanner_device", "Scanner device"),
        ("guest", "Guest"),
        ("system", "System"),
    )
    RESULTS = (("success", "Success"), ("warning", "Warning"), ("error", "Error"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("orgs.Organization", on_delete=models.PROTECT, related_name="+")
    event = models.ForeignKey(
        "events.Event", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    guest = models.ForeignKey(
        "guests.Guest", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    occurred_at = models.DateTimeField(default=tz.now)
    actor_type = models.CharField(max_length=16, choices=ACTOR_TYPES)
    actor_id = models.CharField(max_length=64)
    action = models.CharField(max_length=64)  # e.g. checkin.success, walkin.claim
    result = models.CharField(max_length=8, choices=RESULTS)
    previous_status = models.CharField(max_length=24, blank=True)
    new_status = models.CharField(max_length=24, blank=True)
    gate = models.CharField(max_length=64, blank=True)
    scanner = models.CharField(max_length=64, blank=True)
    entry_token = models.CharField(max_length=128, blank=True)
    details_json = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes: ClassVar = [models.Index(fields=("event", "-occurred_at"))]
        ordering = ("-occurred_at",)

    def __str__(self) -> str:
        return f"{self.occurred_at:%Y-%m-%d %H:%M:%S} {self.action} ({self.result})"
```

- [x] **Step 3: Service helper**

`/Users/vinei/Projects/eventgate/backend/apps/audit/services.py`:

```python
from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.audit.models import AuditEvent

_VALID_RESULTS = {"success", "warning", "error"}


@transaction.atomic
def write_audit(
    *,
    organization,
    event=None,
    guest=None,
    actor_type: str,
    actor_id: str,
    action: str,
    result: str,
    previous_status: str = "",
    new_status: str = "",
    gate: str = "",
    scanner: str = "",
    entry_token: str = "",
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    if not action:
        raise ValueError("audit.action is required")
    if result not in _VALID_RESULTS:
        raise ValueError(f"audit.result must be one of {_VALID_RESULTS}")
    return AuditEvent.objects.create(
        organization=organization,
        event=event,
        guest=guest,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        result=result,
        previous_status=previous_status,
        new_status=new_status,
        gate=gate,
        scanner=scanner,
        entry_token=entry_token,
        details_json=details or {},
    )
```

- [x] **Step 4: Admin (terse)**

`/Users/vinei/Projects/eventgate/backend/apps/audit/admin.py`:

```python
from django.contrib import admin

from apps.audit.models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("occurred_at", "action", "result", "organization", "event", "actor_type")
    list_filter = ("action", "result", "actor_type")
    search_fields = ("entry_token", "actor_id")
    readonly_fields = tuple(f.name for f in AuditEvent._meta.fields)

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
```

- [x] **Step 5: Make + run migrations**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run python manage.py makemigrations audit && uv run pytest tests/test_audit_model.py
```

Expected: migration `audit/migrations/0001_initial.py` written; all three tests pass.

- [x] **Step 6: Commit**

```bash
git add backend/apps/audit backend/tests/test_audit_model.py && git commit -m "feat(audit): AuditEvent model + write_audit helper"
```

---

## Task 3: `apps.guests.transitions` — single source of truth for status moves

**TDD.**

**Files:**
- Create: `backend/apps/guests/transitions.py`
- Create: `backend/tests/test_transitions.py`

- [x] **Step 1: Test file**

`/Users/vinei/Projects/eventgate/backend/tests/test_transitions.py`:

```python
import pytest

from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.transitions import (
    InvalidTransition,
    apply_entry_transition,
    apply_info_transition,
    can_transition_entry,
    can_transition_info,
)
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _guest(**kwargs):
    org = Organization.objects.create(name="O", slug=f"o-{Guest.objects.count()}")
    ev = Event.objects.create(organization=org, name="E", slug="e")
    defaults = dict(
        organization=org, event=ev, guest_type="pre_registered",
        entry_token="t", entry_status="registered_not_arrived", info_status="info_completed",
    )
    defaults.update(kwargs)
    return Guest.objects.create(**defaults)


def test_prereg_checkin_happy_path():
    g = _guest()
    assert can_transition_entry(g, to="checked_in")
    apply_entry_transition(g, to="checked_in")
    g.refresh_from_db()
    assert g.entry_status == "checked_in"


def test_double_checkin_rejected():
    g = _guest(entry_status="checked_in")
    with pytest.raises(InvalidTransition):
        apply_entry_transition(g, to="checked_in")


def test_walkin_display_to_checked_in_sets_info_status():
    g = _guest(guest_type="walk_in", entry_status="displayed", info_status="info_completed")
    apply_entry_transition(g, to="checked_in", side_effects={"info_status": "claimed_pending_info"})
    g.refresh_from_db()
    assert g.entry_status == "checked_in"
    assert g.info_status == "claimed_pending_info"


def test_walkin_display_to_voided():
    g = _guest(guest_type="walk_in", entry_status="displayed")
    apply_entry_transition(g, to="voided")
    g.refresh_from_db()
    assert g.entry_status == "voided"


def test_info_completion():
    g = _guest(info_status="claimed_pending_info")
    apply_info_transition(g, to="info_completed")
    g.refresh_from_db()
    assert g.info_status == "info_completed"


def test_invalid_info_jump():
    g = _guest(info_status="info_completed")
    with pytest.raises(InvalidTransition):
        apply_info_transition(g, to="claimed_pending_info")


@pytest.mark.parametrize("frm,to", [
    ("registered_not_arrived", "voided"),     # not in spec
    ("checked_in", "registered_not_arrived"), # never reverse
    ("voided", "checked_in"),                 # never re-check-in voided
])
def test_disallowed_entry_transitions(frm, to):
    g = _guest(entry_status=frm)
    assert not can_transition_entry(g, to=to)
    with pytest.raises(InvalidTransition):
        apply_entry_transition(g, to=to)
```

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest tests/test_transitions.py
```

Expected: `ModuleNotFoundError`.

- [x] **Step 2: Module**

`/Users/vinei/Projects/eventgate/backend/apps/guests/transitions.py`:

```python
"""Single source of truth for Guest status moves.

Mirrors the MVP TokenService.validateTransition() table. Any code that mutates
entry_status or info_status MUST route through here.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.guests.models import Guest


class InvalidTransition(Exception):
    pass


# (guest_type, from_status) -> {allowed_to_status}
_ENTRY_TABLE: dict[tuple[str, str], set[str]] = {
    ("pre_registered", "registered_not_arrived"): {"checked_in", "manual_review"},
    ("walk_in", "displayed"): {"checked_in", "voided", "manual_review"},
    # No exits from checked_in, voided, manual_review at MVP — admin override only (Plan F).
}

# from_info_status -> {allowed_to_info_status}
_INFO_TABLE: dict[str, set[str]] = {
    "claimed_pending_info": {"info_completed", "manual_review"},
    # info_completed is terminal at MVP.
}


def can_transition_entry(guest: Guest, *, to: str) -> bool:
    return to in _ENTRY_TABLE.get((guest.guest_type, guest.entry_status), set())


def can_transition_info(guest: Guest, *, to: str) -> bool:
    return to in _INFO_TABLE.get(guest.info_status, set())


@transaction.atomic
def apply_entry_transition(
    guest: Guest, *, to: str, side_effects: dict | None = None
) -> Guest:
    if not can_transition_entry(guest, to=to):
        raise InvalidTransition(
            f"Cannot transition {guest.guest_type} from {guest.entry_status} to {to}"
        )
    previous = guest.entry_status
    guest.entry_status = to
    if to == "checked_in":
        guest.checked_in_at = timezone.now()
    if side_effects:
        for k, v in side_effects.items():
            setattr(guest, k, v)
    update_fields = {"entry_status", "checked_in_at", "updated_at"}
    if side_effects:
        update_fields.update(side_effects.keys())
    guest.save(update_fields=list(update_fields))
    guest._previous_entry_status = previous  # type: ignore[attr-defined]
    return guest


@transaction.atomic
def apply_info_transition(guest: Guest, *, to: str) -> Guest:
    if not can_transition_info(guest, to=to):
        raise InvalidTransition(
            f"Cannot transition info_status from {guest.info_status} to {to}"
        )
    previous = guest.info_status
    guest.info_status = to
    guest.save(update_fields=["info_status", "updated_at"])
    guest._previous_info_status = previous  # type: ignore[attr-defined]
    return guest
```

```bash
uv run pytest tests/test_transitions.py
```

Expected: all 7 cases pass.

- [x] **Step 3: Commit**

```bash
git add backend/apps/guests/transitions.py backend/tests/test_transitions.py && git commit -m "feat(guests): TransitionValidator (entry_status + info_status)"
```

---

## Task 4: Event PIN — set + rotate endpoints

**TDD.** Owner/admin only. Bcrypt-hashed at rest. Sets `event_pin_hash` and `event_pin_rotated_at`.

**Files:**
- Modify: `backend/apps/events/services.py` (add `set_event_pin`, `check_event_pin`)
- Modify: `backend/apps/events/views.py` (add `EventPinView`)
- Modify: `backend/apps/events/urls.py`
- Create: `backend/tests/test_event_pin.py`

- [x] **Step 1: Test file**

`/Users/vinei/Projects/eventgate/backend/tests/test_event_pin.py`:

```python
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.events.services import check_event_pin, set_event_pin
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup(django_user_model):
    user = django_user_model.objects.create(email="owner@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event, user


def test_set_pin_service_hashes_and_verifies(setup):
    _, _, event, _ = setup
    set_event_pin(event, "1234")
    event.refresh_from_db()
    assert event.event_pin_hash and event.event_pin_hash != "1234"
    assert check_event_pin(event, "1234") is True
    assert check_event_pin(event, "wrong") is False


def test_set_pin_endpoint_owner_ok(setup):
    client, org, event, _ = setup
    r = client.post(f"/api/v1/orgs/{org.slug}/events/{event.slug}/pin/set/", {"pin": "0420"}, format="json")
    assert r.status_code == 200
    event.refresh_from_db()
    assert check_event_pin(event, "0420")


def test_set_pin_min_length(setup):
    client, org, event, _ = setup
    r = client.post(f"/api/v1/orgs/{org.slug}/events/{event.slug}/pin/set/", {"pin": "12"}, format="json")
    assert r.status_code == 400


def test_rotate_pin_clears_old(setup):
    client, org, event, _ = setup
    set_event_pin(event, "1111")
    r = client.post(f"/api/v1/orgs/{org.slug}/events/{event.slug}/pin/rotate/", {"pin": "2222"}, format="json")
    assert r.status_code == 200
    event.refresh_from_db()
    assert check_event_pin(event, "2222") is True
    assert check_event_pin(event, "1111") is False


def test_set_pin_requires_admin_or_owner(setup, django_user_model):
    _, org, event, _ = setup
    staff = django_user_model.objects.create(email="staff@x.com")
    OrganizationMembership.objects.create(organization=org, user=staff, role="staff", is_active=True)
    client = APIClient()
    client.force_authenticate(user=staff)
    r = client.post(f"/api/v1/orgs/{org.slug}/events/{event.slug}/pin/set/", {"pin": "9999"}, format="json")
    assert r.status_code == 403
```

```bash
uv run pytest tests/test_event_pin.py
```

Expected: import errors / 404s.

- [x] **Step 2: services**

In `/Users/vinei/Projects/eventgate/backend/apps/events/services.py`, append:

```python
import bcrypt
from django.utils import timezone as _tz


def set_event_pin(event, raw_pin: str) -> None:
    if not raw_pin or len(raw_pin) < 4:
        raise ValueError("PIN must be at least 4 characters.")
    hashed = bcrypt.hashpw(raw_pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    event.event_pin_hash = hashed
    event.event_pin_rotated_at = _tz.now()
    event.save(update_fields=["event_pin_hash", "event_pin_rotated_at", "updated_at"])


def check_event_pin(event, raw_pin: str) -> bool:
    if not event.event_pin_hash or not raw_pin:
        return False
    try:
        return bcrypt.checkpw(raw_pin.encode("utf-8"), event.event_pin_hash.encode("utf-8"))
    except ValueError:
        return False
```

- [x] **Step 3: views**

In `/Users/vinei/Projects/eventgate/backend/apps/events/views.py`, append (do not remove the existing `EventViewSet`):

```python
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.events.services import set_event_pin


class EventPinView(APIView):
    """POST /api/v1/orgs/<org>/events/<event_slug>/pin/{set,rotate}/

    Owner/admin only. set and rotate share semantics; rotate is just a clear-name alias.
    """

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin")

    def post(self, request, org_slug, slug, action):
        from apps.events.models import Event
        from django.shortcuts import get_object_or_404

        event = get_object_or_404(Event, organization=request.organization, slug=slug)
        pin = (request.data.get("pin") or "").strip()
        try:
            set_event_pin(event, pin)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response({"detail": "PIN updated.", "rotated_at": event.event_pin_rotated_at})
```

- [x] **Step 4: urls**

In `/Users/vinei/Projects/eventgate/backend/apps/events/urls.py`, append two routes:

```python
from apps.events.views import EventPinView

urlpatterns += [
    path(
        "orgs/<slug:org_slug>/events/<slug:slug>/pin/set/",
        EventPinView.as_view(),
        {"action": "set"},
        name="event-pin-set",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:slug>/pin/rotate/",
        EventPinView.as_view(),
        {"action": "rotate"},
        name="event-pin-rotate",
    ),
]
```

```bash
uv run pytest tests/test_event_pin.py
```

Expected: all 5 cases pass.

- [x] **Step 5: Commit**

```bash
git add backend/apps/events backend/tests/test_event_pin.py && git commit -m "feat(events): event PIN set + rotate endpoints (owner/admin only)"
```

---

## Task 5: `apps.devices` models + admin

**TDD.**

**Files:**
- Create: `backend/apps/devices/models.py`
- Create: `backend/apps/devices/admin.py`
- Create: `backend/tests/test_devices_models.py`

- [x] **Step 1: Test file**

`/Users/vinei/Projects/eventgate/backend/tests/test_devices_models.py`:

```python
import pytest
from django.db import IntegrityError

from apps.devices.models import EventPinSession, ScannerDevice
from apps.events.models import Event
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def event():
    org = Organization.objects.create(name="O", slug="o")
    return Event.objects.create(organization=org, name="E", slug="e")


def test_create_device(event):
    d = ScannerDevice.objects.create(
        organization=event.organization, event=event, label="Gate 1 Lane A",
        role="scanner", device_token_hash="h",
    )
    assert d.organization_id == event.organization_id
    assert d.role == "scanner"
    assert d.revoked_at is None


def test_unique_label_per_event_per_role(event):
    ScannerDevice.objects.create(
        organization=event.organization, event=event, label="G1", role="scanner",
        device_token_hash="h",
    )
    with pytest.raises(IntegrityError):
        ScannerDevice.objects.create(
            organization=event.organization, event=event, label="G1", role="scanner",
            device_token_hash="h2",
        )


def test_same_label_ok_across_roles(event):
    ScannerDevice.objects.create(
        organization=event.organization, event=event, label="G1", role="scanner",
        device_token_hash="h",
    )
    ScannerDevice.objects.create(
        organization=event.organization, event=event, label="G1", role="walkin_display",
        device_token_hash="h2",
    )
    assert ScannerDevice.objects.count() == 2


def test_pin_session_links_device(event):
    d = ScannerDevice.objects.create(
        organization=event.organization, event=event, label="G1", role="scanner",
        device_token_hash="h",
    )
    s = EventPinSession.objects.create(event=event, scanner_device=d, session_token_hash="t")
    assert s.event_id == event.id
    assert s.scanner_device_id == d.id
    assert s.unlocked_at is not None
```

- [x] **Step 2: Models**

`/Users/vinei/Projects/eventgate/backend/apps/devices/models.py`:

```python
from __future__ import annotations

import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone as tz


class ScannerDevice(models.Model):
    ROLES = (
        ("scanner", "Pre-reg scanner"),
        ("walkin_display", "Walk-in display"),
        ("helpdesk", "Help desk"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("orgs.Organization", on_delete=models.CASCADE, related_name="+")
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="scanner_devices")
    label = models.CharField(max_length=80)
    role = models.CharField(max_length=16, choices=ROLES)
    gate = models.CharField(max_length=64, blank=True)
    enrollment_code_hash = models.CharField(
        max_length=128, blank=True,
        help_text="SHA-256 of the one-time enrollment code. Cleared once exchanged.",
    )
    device_token_hash = models.CharField(
        max_length=128, blank=True,
        help_text="SHA-256 of the durable per-device token. Empty until enrollment completes.",
    )
    enrolled_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=tz.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("event", "label", "role"), name="unique_device_label_per_event_role"
            ),
        ]
        indexes: ClassVar = [
            models.Index(fields=("event", "role", "revoked_at")),
        ]

    def __str__(self) -> str:
        return f"{self.label} ({self.role})"


class EventPinSession(models.Model):
    """Receipt that a device has unlocked its event with the correct PIN.

    Short-lived (default 8h) bearer token; the raw token is returned once and
    hashed at rest. Sent as `Authorization: Bearer <raw>` on mutating endpoints.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="pin_sessions")
    scanner_device = models.ForeignKey(ScannerDevice, on_delete=models.CASCADE, related_name="sessions")
    session_token_hash = models.CharField(max_length=128)
    unlocked_at = models.DateTimeField(default=tz.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    unlocked_by_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        indexes: ClassVar = [
            models.Index(fields=("scanner_device", "-unlocked_at")),
        ]
        ordering = ("-unlocked_at",)
```

- [x] **Step 3: Admin (terse)**

`/Users/vinei/Projects/eventgate/backend/apps/devices/admin.py`:

```python
from django.contrib import admin

from apps.devices.models import EventPinSession, ScannerDevice

admin.site.register(ScannerDevice)
admin.site.register(EventPinSession)
```

- [x] **Step 4: Migrate + run tests**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run python manage.py makemigrations devices && uv run pytest tests/test_devices_models.py
```

Expected: migration `devices/migrations/0001_initial.py`; 4 tests pass.

- [x] **Step 5: Commit**

```bash
git add backend/apps/devices backend/tests/test_devices_models.py && git commit -m "feat(devices): ScannerDevice + EventPinSession models"
```

---

## Task 6: Device enrollment — organizer-side create + device-side exchange

**TDD.** Two endpoints:
1. `POST /api/v1/orgs/<org>/events/<event_slug>/devices/` — owner/admin/manager creates a `ScannerDevice` row; server returns a one-time **enrollment code** (raw; hashed in DB).
2. `POST /api/v1/devices/enroll/` — public-but-rate-limited; takes `{enrollment_code}`, returns `{device_id, device_token}` (token raw, hashed in DB), clears `enrollment_code_hash`, sets `enrolled_at`.

**Files:**
- Create: `backend/apps/devices/services.py`
- Create: `backend/apps/devices/serializers.py`
- Create: `backend/apps/devices/views.py`
- Create: `backend/apps/devices/urls.py`
- Modify: `backend/config/urls.py` to include `apps.devices.urls`
- Create: `backend/tests/test_devices_enrollment.py`

- [x] **Step 1: Test file**

`/Users/vinei/Projects/eventgate/backend/tests/test_devices_enrollment.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.devices.models import ScannerDevice
from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup(django_user_model):
    user = django_user_model.objects.create(email="o@x.com")
    org = Organization.objects.create(name="O", slug="o")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner", is_active=True)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=user)
    return c, org, event


def test_create_device_returns_one_time_enrollment_code(setup):
    c, org, event = setup
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "Gate 1 Lane A", "role": "scanner", "gate": "Gate 1"},
        format="json",
    )
    assert r.status_code == 201
    assert "enrollment_code" in r.data
    assert len(r.data["enrollment_code"]) > 20  # secure token-like length
    assert "device_token" not in r.data
    d = ScannerDevice.objects.get(id=r.data["device_id"])
    assert d.enrollment_code_hash and not d.device_token_hash
    assert d.enrolled_at is None


def test_enroll_exchanges_code_for_device_token(setup):
    c, org, event = setup
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G1", "role": "scanner"}, format="json",
    )
    code = r.data["enrollment_code"]
    anon = APIClient()
    r2 = anon.post("/api/v1/devices/enroll/", {"enrollment_code": code}, format="json")
    assert r2.status_code == 200
    assert "device_token" in r2.data
    assert "device_id" in r2.data
    d = ScannerDevice.objects.get(id=r2.data["device_id"])
    assert d.device_token_hash
    assert d.enrollment_code_hash == ""  # cleared after use
    assert d.enrolled_at is not None


def test_enroll_with_invalid_code_returns_404(setup):
    anon = APIClient()
    r = anon.post("/api/v1/devices/enroll/", {"enrollment_code": "nope"}, format="json")
    assert r.status_code == 404


def test_enroll_with_already_used_code_fails(setup):
    c, org, event = setup
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G1", "role": "scanner"}, format="json",
    )
    code = r.data["enrollment_code"]
    anon = APIClient()
    anon.post("/api/v1/devices/enroll/", {"enrollment_code": code}, format="json")
    r2 = anon.post("/api/v1/devices/enroll/", {"enrollment_code": code}, format="json")
    assert r2.status_code == 404


def test_revoke_device(setup):
    c, org, event = setup
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G1", "role": "scanner"}, format="json",
    )
    dev_id = r.data["device_id"]
    r2 = c.delete(f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/{dev_id}/")
    assert r2.status_code == 204
    d = ScannerDevice.objects.get(id=dev_id)
    assert d.revoked_at is not None


def test_list_devices(setup):
    c, org, event = setup
    c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G1", "role": "scanner"}, format="json",
    )
    c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/",
        {"label": "G2", "role": "walkin_display"}, format="json",
    )
    r = c.get(f"/api/v1/orgs/{org.slug}/events/{event.slug}/devices/")
    assert r.status_code == 200
    assert len(r.data) == 2
    for row in r.data:
        assert "device_token" not in row
        assert "enrollment_code" not in row
```

- [x] **Step 2: services**

`/Users/vinei/Projects/eventgate/backend/apps/devices/services.py`:

```python
from __future__ import annotations

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.common.tokens import generate_token, hash_token
from apps.devices.models import ScannerDevice


@transaction.atomic
def create_device(*, organization, event, label: str, role: str, gate: str = "") -> tuple[ScannerDevice, str]:
    enrollment_code = generate_token()
    device = ScannerDevice.objects.create(
        organization=organization,
        event=event,
        label=label,
        role=role,
        gate=gate,
        enrollment_code_hash=hash_token(enrollment_code),
    )
    return device, enrollment_code


@transaction.atomic
def complete_enrollment(*, enrollment_code: str) -> tuple[ScannerDevice, str]:
    device = get_object_or_404(
        ScannerDevice,
        enrollment_code_hash=hash_token(enrollment_code),
        device_token_hash="",
        revoked_at__isnull=True,
    )
    device_token = generate_token()
    device.device_token_hash = hash_token(device_token)
    device.enrollment_code_hash = ""
    device.enrolled_at = timezone.now()
    device.save(update_fields=["device_token_hash", "enrollment_code_hash", "enrolled_at", "updated_at"])
    return device, device_token


@transaction.atomic
def revoke_device(device: ScannerDevice) -> None:
    if device.revoked_at:
        return
    device.revoked_at = timezone.now()
    device.save(update_fields=["revoked_at", "updated_at"])
```

- [x] **Step 3: serializers**

`/Users/vinei/Projects/eventgate/backend/apps/devices/serializers.py`:

```python
from rest_framework import serializers

from apps.devices.models import ScannerDevice


class DeviceCreateSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=80)
    role = serializers.ChoiceField(choices=[c[0] for c in ScannerDevice.ROLES])
    gate = serializers.CharField(max_length=64, required=False, allow_blank=True)


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScannerDevice
        fields = (
            "id", "label", "role", "gate",
            "enrolled_at", "last_seen_at", "revoked_at",
            "created_at",
        )
```

- [x] **Step 4: views**

`/Users/vinei/Projects/eventgate/backend/apps/devices/views.py`:

```python
from __future__ import annotations

from typing import ClassVar

from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.devices.models import ScannerDevice
from apps.devices.serializers import DeviceCreateSerializer, DeviceSerializer
from apps.devices.services import complete_enrollment, create_device, revoke_device
from apps.events.models import Event


class OrgDeviceViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def list(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        qs = ScannerDevice.objects.filter(event=event).order_by("-created_at")
        return Response(DeviceSerializer(qs, many=True).data)

    def create(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        ser = DeviceCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        device, enrollment_code = create_device(
            organization=request.organization,
            event=event,
            **ser.validated_data,
        )
        body = DeviceSerializer(device).data
        body["device_id"] = str(device.id)
        body["enrollment_code"] = enrollment_code
        return Response(body, status=status.HTTP_201_CREATED)

    def destroy(self, request, org_slug, event_slug, device_id):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        device = get_object_or_404(ScannerDevice, id=device_id, event=event)
        revoke_device(device)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeviceEnrollView(APIView):
    """POST /api/v1/devices/enroll/  {"enrollment_code": "..."} -> {device_id, device_token}"""

    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request):
        code = (request.data.get("enrollment_code") or "").strip()
        if not code:
            return Response({"detail": "enrollment_code required"}, status=400)
        device, device_token = complete_enrollment(enrollment_code=code)
        return Response({
            "device_id": str(device.id),
            "device_token": device_token,
            "event_id": str(device.event_id),
            "event_slug": device.event.slug,
            "org_slug": device.organization.slug,
            "label": device.label,
            "role": device.role,
        })
```

- [x] **Step 5: urls**

`/Users/vinei/Projects/eventgate/backend/apps/devices/urls.py`:

```python
from django.urls import path

from apps.devices.views import DeviceEnrollView, OrgDeviceViewSet

device_list = OrgDeviceViewSet.as_view({"get": "list", "post": "create"})
device_detail = OrgDeviceViewSet.as_view({"delete": "destroy"})

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/devices/",
        device_list, name="device-list",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/devices/<uuid:device_id>/",
        device_detail, name="device-detail",
    ),
    path("devices/enroll/", DeviceEnrollView.as_view(), name="device-enroll"),
]
```

- [x] **Step 6: Wire root urls**

In `/Users/vinei/Projects/eventgate/backend/config/urls.py` add an include line for `apps.devices.urls` and also `apps.checkins.urls` + `apps.walkins.urls` (the latter two are created in later tasks but include them now to avoid the same import shuffle later):

```python
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/", include("apps.common.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.orgs.urls")),
    path("api/v1/", include("apps.events.urls")),
    path("api/v1/", include("apps.guests.urls")),
    path("api/v1/", include("apps.devices.urls")),
    # path("api/v1/", include("apps.checkins.urls")),   # uncomment in Task 8
    # path("api/v1/", include("apps.walkins.urls")),    # uncomment in Task 10
]
```

```bash
uv run pytest tests/test_devices_enrollment.py
```

Expected: all 6 cases pass.

- [x] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(devices): enrollment endpoints (organizer create + device exchange)"
```

---

## Task 7: Device + session authentication classes; PIN unlock endpoint

**TDD.** Two DRF authentication classes:
- `DeviceTokenAuthentication` — reads `Authorization: Device <raw>`, sets `request.scanner_device`. Used by `POST /api/v1/devices/unlock/` (the PIN entry point) and any device-bookkeeping endpoint.
- `SessionTokenAuthentication` — reads `Authorization: Bearer <raw>`, validates an unexpired `EventPinSession`, sets both `request.scanner_device` and `request.scanner_session`. Used by all mutating scanner endpoints (`checkin`, `walkin display next`).

Also: `POST /api/v1/devices/unlock/` takes `{event_id, pin}` (authenticated as Device), validates PIN against the device's event, mints an `EventPinSession` with 8h TTL, returns the raw session token.

**Files:**
- Create: `backend/apps/devices/auth.py`
- Modify: `backend/apps/devices/services.py` (add `unlock_with_pin`)
- Modify: `backend/apps/devices/views.py` (add `DeviceUnlockView`)
- Modify: `backend/apps/devices/urls.py`
- Create: `backend/tests/test_devices_pin_unlock.py`
- Create: `backend/tests/test_device_auth.py`

- [x] **Step 1: Test files**

`/Users/vinei/Projects/eventgate/backend/tests/test_devices_pin_unlock.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.devices.services import create_device, complete_enrollment
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _enroll():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "4242")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, device_token = complete_enrollment(enrollment_code=code)
    return event, d, device_token


def test_unlock_with_correct_pin():
    event, device, dt = _enroll()
    c = APIClient(HTTP_AUTHORIZATION=f"Device {dt}")
    r = c.post("/api/v1/devices/unlock/", {"pin": "4242"}, format="json")
    assert r.status_code == 200
    assert "session_token" in r.data
    assert "expires_at" in r.data


def test_unlock_wrong_pin():
    event, device, dt = _enroll()
    c = APIClient(HTTP_AUTHORIZATION=f"Device {dt}")
    r = c.post("/api/v1/devices/unlock/", {"pin": "0000"}, format="json")
    assert r.status_code == 403


def test_unlock_no_device_token():
    c = APIClient()
    r = c.post("/api/v1/devices/unlock/", {"pin": "4242"}, format="json")
    assert r.status_code == 401


def test_unlock_revoked_device_fails():
    event, device, dt = _enroll()
    from apps.devices.services import revoke_device
    revoke_device(device)
    c = APIClient(HTTP_AUTHORIZATION=f"Device {dt}")
    r = c.post("/api/v1/devices/unlock/", {"pin": "4242"}, format="json")
    assert r.status_code == 401
```

`/Users/vinei/Projects/eventgate/backend/tests/test_device_auth.py`:

```python
import pytest
from django.urls import path
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework.views import APIView

from apps.devices.auth import DeviceTokenAuthentication, SessionTokenAuthentication
from apps.devices.services import create_device, complete_enrollment, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


class _DeviceProtected(APIView):
    authentication_classes = [DeviceTokenAuthentication]
    def get(self, request):
        return Response({"device": str(request.scanner_device.id)})


class _SessionProtected(APIView):
    authentication_classes = [SessionTokenAuthentication]
    def get(self, request):
        return Response({
            "device": str(request.scanner_device.id),
            "session": str(request.scanner_session.id),
        })


@pytest.fixture(autouse=True)
def _urls(settings):
    from django.urls import include
    settings.ROOT_URLCONF = __name__


urlpatterns = [
    path("device/", _DeviceProtected.as_view()),
    path("session/", _SessionProtected.as_view()),
]


def _setup():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, device_token = complete_enrollment(enrollment_code=code)
    _, session_token = unlock_with_pin(device=d, raw_pin="1234")
    return d, device_token, session_token


def test_device_auth_accepts_valid_token():
    d, dt, _ = _setup()
    c = APIClient(HTTP_AUTHORIZATION=f"Device {dt}")
    r = c.get("/device/")
    assert r.status_code == 200
    assert r.data["device"] == str(d.id)


def test_device_auth_rejects_bad_token():
    _setup()
    c = APIClient(HTTP_AUTHORIZATION="Device bogus")
    r = c.get("/device/")
    assert r.status_code == 401


def test_session_auth_accepts_unexpired_session():
    d, _, st = _setup()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.get("/session/")
    assert r.status_code == 200
    assert r.data["device"] == str(d.id)


def test_session_auth_rejects_expired(monkeypatch):
    d, _, st = _setup()
    from datetime import timedelta
    from django.utils import timezone
    from apps.devices.models import EventPinSession
    s = EventPinSession.objects.filter(scanner_device=d).first()
    s.expires_at = timezone.now() - timedelta(minutes=1)
    s.save()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.get("/session/")
    assert r.status_code == 401
```

- [x] **Step 2: auth module**

`/Users/vinei/Projects/eventgate/backend/apps/devices/auth.py`:

```python
from __future__ import annotations

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from apps.common.tokens import hash_token
from apps.devices.models import EventPinSession, ScannerDevice


class _AnonymousDeviceUser:
    """Bare object DRF needs as `request.user`. Scanner endpoints don't have a
    user; they have a device. We expose it as `request.scanner_device`."""

    is_authenticated = True
    is_anonymous = False
    is_staff = False
    is_active = True

    def __init__(self, label: str = "device"):
        self.label = label

    @property
    def pk(self) -> None:
        return None


def _extract(prefix: str, header_value: str) -> str | None:
    if not header_value or not header_value.lower().startswith(prefix.lower() + " "):
        return None
    return header_value.split(" ", 1)[1].strip() or None


class DeviceTokenAuthentication(BaseAuthentication):
    keyword = "Device"

    def authenticate(self, request):
        raw = _extract(self.keyword, request.headers.get("Authorization", ""))
        if not raw:
            return None
        try:
            device = ScannerDevice.objects.select_related("event", "organization").get(
                device_token_hash=hash_token(raw), revoked_at__isnull=True,
            )
        except ScannerDevice.DoesNotExist:
            raise AuthenticationFailed("Invalid device token.")
        request.scanner_device = device  # type: ignore[attr-defined]
        return (_AnonymousDeviceUser(label=device.label), device)

    def authenticate_header(self, request):
        return self.keyword


class SessionTokenAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        raw = _extract(self.keyword, request.headers.get("Authorization", ""))
        if not raw:
            return None
        try:
            session = EventPinSession.objects.select_related(
                "scanner_device", "scanner_device__event", "scanner_device__organization",
            ).get(session_token_hash=hash_token(raw))
        except EventPinSession.DoesNotExist:
            raise AuthenticationFailed("Invalid session.")
        if session.expires_at and session.expires_at < timezone.now():
            raise AuthenticationFailed("Session expired.")
        if session.scanner_device.revoked_at:
            raise AuthenticationFailed("Device revoked.")
        request.scanner_device = session.scanner_device  # type: ignore[attr-defined]
        request.scanner_session = session  # type: ignore[attr-defined]
        return (_AnonymousDeviceUser(label=session.scanner_device.label), session)

    def authenticate_header(self, request):
        return self.keyword
```

- [x] **Step 3: unlock service**

Append to `/Users/vinei/Projects/eventgate/backend/apps/devices/services.py`:

```python
from datetime import timedelta

from apps.common.tokens import generate_token, hash_token
from apps.devices.models import EventPinSession
from apps.events.services import check_event_pin

SESSION_TTL = timedelta(hours=8)


class WrongPin(Exception):
    pass


@transaction.atomic
def unlock_with_pin(*, device, raw_pin: str, ip: str | None = None) -> tuple[EventPinSession, str]:
    if not check_event_pin(device.event, raw_pin):
        raise WrongPin("Incorrect event PIN.")
    raw_session = generate_token()
    expires = timezone.now() + SESSION_TTL
    session = EventPinSession.objects.create(
        event=device.event,
        scanner_device=device,
        session_token_hash=hash_token(raw_session),
        expires_at=expires,
        unlocked_by_ip=ip,
    )
    device.last_seen_at = timezone.now()
    device.save(update_fields=["last_seen_at", "updated_at"])
    return session, raw_session
```

- [x] **Step 4: unlock view**

Append to `/Users/vinei/Projects/eventgate/backend/apps/devices/views.py`:

```python
from apps.devices.auth import DeviceTokenAuthentication
from apps.devices.services import WrongPin, unlock_with_pin


class DeviceUnlockView(APIView):
    """POST /api/v1/devices/unlock/  Authorization: Device <raw>  {"pin": "..."}
    -> {session_token, expires_at}"""

    authentication_classes = (DeviceTokenAuthentication,)
    permission_classes = (AllowAny,)  # auth handles it

    def post(self, request):
        device = getattr(request, "scanner_device", None)
        if not device:
            return Response({"detail": "Device token required."}, status=401)
        pin = (request.data.get("pin") or "").strip()
        try:
            session, raw = unlock_with_pin(
                device=device, raw_pin=pin, ip=request.META.get("REMOTE_ADDR"),
            )
        except WrongPin as exc:
            return Response({"detail": str(exc)}, status=403)
        return Response({
            "session_token": raw,
            "expires_at": session.expires_at,
            "device_id": str(device.id),
            "event_id": str(device.event_id),
            "label": device.label,
            "role": device.role,
        })
```

- [x] **Step 5: urls**

In `/Users/vinei/Projects/eventgate/backend/apps/devices/urls.py`, append:

```python
from apps.devices.views import DeviceUnlockView

urlpatterns += [
    path("devices/unlock/", DeviceUnlockView.as_view(), name="device-unlock"),
]
```

```bash
uv run pytest tests/test_devices_pin_unlock.py tests/test_device_auth.py
```

Expected: 8 tests pass.

- [x] **Step 6: Commit**

```bash
git add backend/ && git commit -m "feat(devices): DeviceTokenAuthentication + SessionTokenAuthentication + PIN unlock"
```

---

## Task 8: Advisory-lock helper + idempotency-key cache

**TDD.** Thin helpers, no models.

**Files:**
- Create: `backend/apps/common/locks.py`
- Create: `backend/apps/common/idempotency.py`
- Create: `backend/tests/test_locks_idempotency.py`

- [x] **Step 1: Test file**

`/Users/vinei/Projects/eventgate/backend/tests/test_locks_idempotency.py`:

```python
import pytest
from django.db import connection, transaction

from apps.common.idempotency import already_seen, remember
from apps.common.locks import advisory_xact_lock

pytestmark = pytest.mark.django_db(transaction=True)


def test_advisory_lock_returns_within_txn():
    with transaction.atomic():
        advisory_xact_lock("token-abc")
        cur = connection.cursor()
        cur.execute("SELECT 1")
        assert cur.fetchone() == (1,)


def test_idempotency_first_call_returns_false():
    assert already_seen("k1", scope="checkins") is False
    remember("k1", scope="checkins", value="ok")


def test_idempotency_second_call_returns_stored_payload():
    assert already_seen("k2", scope="checkins") is False
    remember("k2", scope="checkins", value={"status": "ok"})
    assert already_seen("k2", scope="checkins") == {"status": "ok"}


def test_idempotency_scopes_are_isolated():
    remember("k3", scope="checkins", value="x")
    assert already_seen("k3", scope="walkins") is False
```

- [x] **Step 2: locks module**

`/Users/vinei/Projects/eventgate/backend/apps/common/locks.py`:

```python
"""pg advisory-lock helper for serializing token mutations.

Use inside a transaction. `hashtext(text)` is a stable signed 32-bit hash that
Postgres ships natively.
"""

from __future__ import annotations

from django.db import connection


def advisory_xact_lock(key: str) -> None:
    """Acquire a transaction-scoped advisory lock keyed by `hashtext(key)`."""
    if connection.vendor != "postgresql":
        # SQLite test paths still work; no-op the lock.
        return
    with connection.cursor() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [key])
```

- [x] **Step 3: idempotency module**

`/Users/vinei/Projects/eventgate/backend/apps/common/idempotency.py`:

```python
"""Redis-backed idempotency store for client_idempotency_key.

Stores the JSON-serialized response payload under `idem:{scope}:{key}` with
24h TTL. Calls to `already_seen` return the stored payload (dict/str) or
False if never seen.
"""

from __future__ import annotations

import json
from typing import Any

from django.core.cache import cache

TTL_SECONDS = 24 * 60 * 60


def _full(scope: str, key: str) -> str:
    return f"idem:{scope}:{key}"


def already_seen(key: str, *, scope: str) -> Any | bool:
    raw = cache.get(_full(scope, key))
    if raw is None:
        return False
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return raw


def remember(key: str, *, scope: str, value: Any) -> None:
    cache.set(_full(scope, key), json.dumps(value, default=str), timeout=TTL_SECONDS)
```

```bash
uv run pytest tests/test_locks_idempotency.py
```

Expected: 4 tests pass (locmem cache is the test backend, satisfying the cache-API contract).

- [x] **Step 4: Commit**

```bash
git add backend/apps/common/locks.py backend/apps/common/idempotency.py backend/tests/test_locks_idempotency.py && git commit -m "feat(common): advisory_xact_lock + idempotency helpers"
```

---

## Task 9: Pre-reg check-in endpoint (`POST /api/v1/checkins/`)

**TDD.** The hot path. Auth: `SessionTokenAuthentication`. Body:

```json
{
  "token": "<raw entry_token>",
  "gate": "Gate 1",
  "scanner_label": "Lane A",
  "client_idempotency_key": "uuid-v4",
  "scanned_at": "2026-08-01T12:00:00Z"
}
```

Behavior:
1. Auth → `request.scanner_device` is set; role must be `scanner`.
2. Idempotency: `already_seen(client_idempotency_key, scope="checkins")` → if hit, return stored payload.
3. Find guest by `(event=device.event, entry_token=token)`. If missing → 404, audit `checkin.token_not_found` (no guest FK).
4. `advisory_xact_lock("checkin:" + token)`.
5. `apply_entry_transition(guest, to="checked_in")`. If `InvalidTransition` (already checked-in, voided, etc.) → 409, audit `checkin.duplicate` (with `result="warning"`).
6. Set `guest.gate`, `guest.scanner` to the request values, save.
7. Audit `checkin.success` (`result="success"`).
8. Update `device.last_seen_at`.
9. `remember(key, scope="checkins", value=response_body)`.
10. Return 200 `{ status, guest: {…}, message: "…" }`.

**Files:**
- Create: `backend/apps/checkins/services.py`
- Create: `backend/apps/checkins/views.py`
- Create: `backend/apps/checkins/urls.py`
- Modify: `backend/config/urls.py` to uncomment the `apps.checkins.urls` include from Task 6
- Create: `backend/tests/test_checkin_happy.py`
- Create: `backend/tests/test_checkin_idempotent.py`
- Create: `backend/tests/test_checkin_concurrency.py`

- [x] **Step 1: Test — happy path + edge cases**

`/Users/vinei/Projects/eventgate/backend/tests/test_checkin_happy.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.devices.services import create_device, complete_enrollment, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.services import register_guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _enrolled_scanner():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, device_token = complete_enrollment(enrollment_code=code)
    _, session_token = unlock_with_pin(device=d, raw_pin="1234")
    return event, d, session_token


def _guest(event, **kw):
    return register_guest(event=event, payload={"name": "A", "email": "a@x.com", "phone_or_chat": "1"})


def test_checkin_happy_path():
    event, d, st = _enrolled_scanner()
    g = _guest(event)
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post("/api/v1/checkins/", {
        "token": g.entry_token, "gate": "G1", "scanner_label": "L1",
        "client_idempotency_key": "k1",
    }, format="json")
    assert r.status_code == 200
    assert r.data["status"] == "success"
    assert r.data["guest"]["full_name"] == "A"
    g.refresh_from_db()
    assert g.entry_status == "checked_in"
    assert g.gate == "G1"
    assert g.scanner == "L1"
    assert g.checked_in_at is not None
    assert AuditEvent.objects.filter(action="checkin.success").count() == 1


def test_checkin_token_not_found():
    event, d, st = _enrolled_scanner()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post("/api/v1/checkins/", {
        "token": "no-such-token", "gate": "G1", "scanner_label": "L1",
        "client_idempotency_key": "k2",
    }, format="json")
    assert r.status_code == 404
    assert AuditEvent.objects.filter(action="checkin.token_not_found").count() == 1


def test_checkin_duplicate_returns_409():
    event, d, st = _enrolled_scanner()
    g = _guest(event)
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    c.post("/api/v1/checkins/", {
        "token": g.entry_token, "gate": "G1", "scanner_label": "L1", "client_idempotency_key": "ka",
    }, format="json")
    r = c.post("/api/v1/checkins/", {
        "token": g.entry_token, "gate": "G1", "scanner_label": "L1", "client_idempotency_key": "kb",
    }, format="json")
    assert r.status_code == 409
    assert r.data["status"] == "duplicate"
    assert AuditEvent.objects.filter(action="checkin.duplicate").count() == 1


def test_checkin_requires_scanner_role():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    # walkin_display device tries to check in
    d, code = create_device(organization=org, event=event, label="W1", role="walkin_display")
    _, device_token = complete_enrollment(enrollment_code=code)
    _, session_token = unlock_with_pin(device=d, raw_pin="1234")
    g = register_guest(event=event, payload={"name": "A", "email": "a@x.com", "phone_or_chat": "1"})

    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {session_token}")
    r = c.post("/api/v1/checkins/", {
        "token": g.entry_token, "gate": "G1", "scanner_label": "L1", "client_idempotency_key": "kw",
    }, format="json")
    assert r.status_code == 403


def test_checkin_without_session_token_401():
    event, d, st = _enrolled_scanner()
    g = _guest(event)
    c = APIClient()
    r = c.post("/api/v1/checkins/", {
        "token": g.entry_token, "gate": "G1", "scanner_label": "L1", "client_idempotency_key": "k",
    }, format="json")
    assert r.status_code == 401
```

`/Users/vinei/Projects/eventgate/backend/tests/test_checkin_idempotent.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.devices.services import create_device, complete_enrollment, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.services import register_guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def test_replayed_idempotency_key_returns_same_payload():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, _ = complete_enrollment(enrollment_code=code)
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    g = register_guest(event=event, payload={"name": "A", "email": "a@x.com", "phone_or_chat": "1"})

    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    body = {
        "token": g.entry_token, "gate": "G1", "scanner_label": "L1",
        "client_idempotency_key": "same-key",
    }
    r1 = c.post("/api/v1/checkins/", body, format="json")
    r2 = c.post("/api/v1/checkins/", body, format="json")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.data == r2.data
    # Audit row is NOT duplicated for replayed idempotency key
    assert AuditEvent.objects.filter(action="checkin.success").count() == 1
```

`/Users/vinei/Projects/eventgate/backend/tests/test_checkin_concurrency.py`:

```python
import threading

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.devices.services import create_device, complete_enrollment, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.services import register_guest
from apps.orgs.models import Organization

# This test exercises advisory-lock behavior — requires real Postgres (CI uses it).


@pytest.mark.django_db(transaction=True)
def test_only_one_concurrent_checkin_wins():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, _ = complete_enrollment(enrollment_code=code)
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    g = register_guest(event=event, payload={"name": "A", "email": "a@x.com", "phone_or_chat": "1"})

    results = []

    def call(idx):
        c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
        r = c.post("/api/v1/checkins/", {
            "token": g.entry_token, "gate": "G1", "scanner_label": f"L{idx}",
            "client_idempotency_key": f"key-{idx}",
        }, format="json")
        results.append(r.status_code)
        connection.close()

    threads = [threading.Thread(target=call, args=(i,)) for i in range(5)]
    for t in threads: t.start()
    for t in threads: t.join()
    successes = [s for s in results if s == 200]
    duplicates = [s for s in results if s == 409]
    assert len(successes) == 1
    assert len(duplicates) == 4
```

- [x] **Step 2: services**

`/Users/vinei/Projects/eventgate/backend/apps/checkins/services.py`:

```python
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.audit.services import write_audit
from apps.common.idempotency import already_seen, remember
from apps.common.locks import advisory_xact_lock
from apps.devices.models import ScannerDevice
from apps.guests.models import Guest
from apps.guests.transitions import InvalidTransition, apply_entry_transition


class CheckinFailure(Exception):
    def __init__(self, body: dict[str, Any], http_status: int) -> None:
        self.body = body
        self.http_status = http_status


def _serialize_guest(g: Guest) -> dict[str, Any]:
    return {
        "id": str(g.id),
        "full_name": g.full_name,
        "email": g.email,
        "guest_type": g.guest_type,
        "entry_status": g.entry_status,
        "info_status": g.info_status,
        "gate": g.gate,
        "scanner": g.scanner,
        "checked_in_at": g.checked_in_at.isoformat() if g.checked_in_at else None,
    }


def perform_checkin(
    *,
    device: ScannerDevice,
    token: str,
    gate: str,
    scanner_label: str,
    client_idempotency_key: str,
) -> tuple[dict[str, Any], int]:
    cached = already_seen(client_idempotency_key, scope="checkins")
    if cached is not False:
        return cached, 200

    try:
        guest = Guest.objects.get(event=device.event, entry_token=token)
    except Guest.DoesNotExist:
        write_audit(
            organization=device.organization, event=device.event,
            actor_type="scanner_device", actor_id=str(device.id),
            action="checkin.token_not_found", result="error",
            gate=gate, scanner=scanner_label, entry_token=token[:32],
        )
        raise CheckinFailure(
            {"status": "invalid", "detail": "Token not recognised for this event."}, 404,
        )

    with transaction.atomic():
        advisory_xact_lock(f"checkin:{token}")
        guest.refresh_from_db()
        try:
            apply_entry_transition(guest, to="checked_in")
        except InvalidTransition:
            write_audit(
                organization=device.organization, event=device.event, guest=guest,
                actor_type="scanner_device", actor_id=str(device.id),
                action="checkin.duplicate", result="warning",
                previous_status=guest.entry_status, new_status=guest.entry_status,
                gate=gate, scanner=scanner_label, entry_token=token[:32],
            )
            raise CheckinFailure(
                {"status": "duplicate", "guest": _serialize_guest(guest),
                 "detail": f"Already in state {guest.entry_status}."}, 409,
            )
        guest.gate = gate
        guest.scanner = scanner_label
        guest.save(update_fields=["gate", "scanner", "updated_at"])
        write_audit(
            organization=device.organization, event=device.event, guest=guest,
            actor_type="scanner_device", actor_id=str(device.id),
            action="checkin.success", result="success",
            previous_status="registered_not_arrived", new_status="checked_in",
            gate=gate, scanner=scanner_label, entry_token=token[:32],
        )

    device.last_seen_at = timezone.now()
    device.save(update_fields=["last_seen_at", "updated_at"])

    body = {"status": "success", "guest": _serialize_guest(guest)}
    remember(client_idempotency_key, scope="checkins", value=body)
    return body, 200
```

- [x] **Step 3: views**

`/Users/vinei/Projects/eventgate/backend/apps/checkins/views.py`:

```python
from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.checkins.services import CheckinFailure, perform_checkin
from apps.devices.auth import SessionTokenAuthentication


class CheckinView(APIView):
    """POST /api/v1/checkins/  Authorization: Bearer <session_token>"""

    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = (AllowAny,)

    def post(self, request):
        device = getattr(request, "scanner_device", None)
        if not device:
            return Response({"detail": "Session token required."}, status=401)
        if device.role != "scanner":
            return Response({"detail": "This device cannot check in pre-reg guests."}, status=403)
        token = (request.data.get("token") or "").strip()
        gate = (request.data.get("gate") or "").strip()
        scanner_label = (request.data.get("scanner_label") or "").strip()
        idem = (request.data.get("client_idempotency_key") or "").strip()
        if not token or not idem:
            return Response({"detail": "token and client_idempotency_key required."}, status=400)
        try:
            body, code = perform_checkin(
                device=device, token=token, gate=gate, scanner_label=scanner_label,
                client_idempotency_key=idem,
            )
        except CheckinFailure as exc:
            return Response(exc.body, status=exc.http_status)
        return Response(body, status=code)
```

- [x] **Step 4: urls**

`/Users/vinei/Projects/eventgate/backend/apps/checkins/urls.py`:

```python
from django.urls import path

from apps.checkins.views import CheckinView

urlpatterns = [
    path("checkins/", CheckinView.as_view(), name="checkin"),
]
```

Then uncomment the `apps.checkins.urls` include in `backend/config/urls.py`.

```bash
uv run pytest tests/test_checkin_happy.py tests/test_checkin_idempotent.py tests/test_checkin_concurrency.py
```

Expected: all happy-path + idempotency + concurrency tests pass against Postgres.

- [x] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(checkins): pre-reg check-in endpoint with advisory lock + idempotency + audit"
```

---

## Task 10: `apps.walkins` — display-next + claim + info endpoints

**TDD.** Three endpoints + one migration (partial unique index).

**Behavior — `POST /api/v1/walkins/displays/next/`** (scanner auth, role=`walkin_display`):
- Body: `{ gate, scanner_label }`.
- If there's already a `displayed` walk-in for `(event, gate, scanner_label)`, return it.
- Otherwise create a new `Guest` row with `guest_type="walk_in"`, `entry_status="displayed"`, `info_status="claimed_pending_info"` (default; reset to `claimed_pending_info` once claimed — wait, brief Appendix A says claimed flows: walk-in is displayed → claimed_pending_info on claim → info_completed on form). At creation it's `entry_status=displayed`; `info_status` is null/blank until claim.
- For walk-ins we keep `info_status` default to `"info_completed"` per the existing schema and **explicitly reset to `claimed_pending_info` only when claimed** (consistent with the brief's transition table).
- Return `{ guest_id, entry_token, claim_url }` where `claim_url` is the public URL the guest scans into.

**Behavior — `POST /api/v1/e/<org>/<event>/claim/<token>/`** (public):
- 404 if guest not found / wrong event.
- If already `checked_in`, return idempotent success (return the same claim payload).
- Otherwise transition `displayed → checked_in` + `info_status → claimed_pending_info`. Audit `walkin.claim`.
- Return `{ guest_id, next: "info_form_url" }`.

**Behavior — `POST /api/v1/e/<org>/<event>/info/<token>/`** (public):
- Validates required fields from `RegistrationField`. Writes preset fields + custom_fields. Transitions `claimed_pending_info → info_completed`. Audit `walkin.info_completed`.

**Files:**
- Create: `backend/apps/walkins/services.py`
- Create: `backend/apps/walkins/serializers.py`
- Create: `backend/apps/walkins/views.py`
- Create: `backend/apps/walkins/urls.py`
- Create: `backend/apps/walkins/migrations/0001_initial.py` (partial unique index, hand-written)
- Modify: `backend/config/urls.py` to uncomment the `apps.walkins.urls` include
- Create: `backend/tests/test_walkin_display_next.py`
- Create: `backend/tests/test_walkin_claim.py`
- Create: `backend/tests/test_walkin_info.py`

- [x] **Step 1: Hand-written partial unique index migration**

`/Users/vinei/Projects/eventgate/backend/apps/walkins/migrations/__init__.py` — empty file.

`/Users/vinei/Projects/eventgate/backend/apps/walkins/migrations/0001_initial.py`:

```python
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("guests", "0001_initial")]

    operations = [
        migrations.AddConstraint(
            model_name="guest",
            constraint=models.UniqueConstraint(
                fields=("event", "gate", "scanner"),
                condition=models.Q(entry_status="displayed", guest_type="walk_in"),
                name="one_displayed_walkin_per_scope",
            ),
        ),
    ]
```

Note: this references `guests.Guest`. The migration runs in the `walkins` app's history but mutates the `guests` model — fine in Django.

- [x] **Step 2: services**

`/Users/vinei/Projects/eventgate/backend/apps/walkins/services.py`:

```python
from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404

from apps.audit.services import write_audit
from apps.common.locks import advisory_xact_lock
from apps.common.tokens import generate_token
from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.transitions import (
    InvalidTransition,
    apply_entry_transition,
    apply_info_transition,
)


def build_claim_url(*, event: Event, token: str) -> str:
    base = getattr(settings, "PUBLIC_BASE_URL", "").rstrip("/")
    if not base:
        base = "https://frontend-five-lovat-94.vercel.app"
    return f"{base}/e/{event.organization.slug}/{event.slug}/claim/{token}/"


@transaction.atomic
def get_or_create_displayed(
    *, device, gate: str, scanner_label: str,
) -> tuple[Guest, str]:
    existing = Guest.objects.select_for_update().filter(
        event=device.event, guest_type="walk_in", entry_status="displayed",
        gate=gate, scanner=scanner_label,
    ).first()
    if existing:
        url = build_claim_url(event=device.event, token=existing.entry_token)
        return existing, url

    token = generate_token()
    guest = Guest.objects.create(
        organization=device.organization,
        event=device.event,
        guest_type="walk_in",
        entry_token=token,
        entry_status="displayed",
        info_status="info_completed",  # default; reset on claim
        gate=gate, scanner=scanner_label,
        source="walk_in_display",
    )
    write_audit(
        organization=device.organization, event=device.event, guest=guest,
        actor_type="scanner_device", actor_id=str(device.id),
        action="walkin.display.create", result="success",
        previous_status="", new_status="displayed",
        gate=gate, scanner=scanner_label, entry_token=token[:32],
    )
    return guest, build_claim_url(event=device.event, token=token)


@transaction.atomic
def claim_walkin(*, org_slug: str, event_slug: str, token: str) -> Guest:
    guest = get_object_or_404(
        Guest, event__organization__slug=org_slug, event__slug=event_slug,
        entry_token=token, guest_type="walk_in",
    )
    advisory_xact_lock(f"walkin-claim:{token}")
    guest.refresh_from_db()
    if guest.entry_status == "checked_in":
        return guest  # idempotent — already claimed
    try:
        apply_entry_transition(
            guest, to="checked_in",
            side_effects={"info_status": "claimed_pending_info"},
        )
    except InvalidTransition as exc:
        from apps.checkins.services import CheckinFailure
        write_audit(
            organization=guest.organization, event=guest.event, guest=guest,
            actor_type="guest", actor_id=str(guest.id),
            action="walkin.claim.invalid", result="error",
            previous_status=guest.entry_status, new_status=guest.entry_status,
            entry_token=token[:32],
        )
        raise CheckinFailure({"detail": str(exc)}, 409)
    write_audit(
        organization=guest.organization, event=guest.event, guest=guest,
        actor_type="guest", actor_id=str(guest.id),
        action="walkin.claim", result="success",
        previous_status="displayed", new_status="checked_in",
        entry_token=token[:32],
    )
    return guest


@transaction.atomic
def complete_walkin_info(
    *, org_slug: str, event_slug: str, token: str, payload: dict[str, Any],
) -> Guest:
    guest = get_object_or_404(
        Guest, event__organization__slug=org_slug, event__slug=event_slug,
        entry_token=token, guest_type="walk_in",
    )
    if guest.info_status == "info_completed":
        return guest  # idempotent
    required = list(
        guest.event.registration_fields.filter(required=True).values_list("field_key", flat=True)
    )
    missing = [k for k in required if not payload.get(k)]
    if missing:
        raise ValueError(f"Missing required: {', '.join(missing)}")

    from apps.guests.services import PRESET_FIELDS  # avoid import cycle
    preset = {k: payload[k] for k in PRESET_FIELDS if k in payload}
    known_custom_keys = set(
        guest.event.registration_fields.exclude(field_key__in=PRESET_FIELDS).values_list(
            "field_key", flat=True
        )
    )
    custom = {k: v for k, v in payload.items() if k in known_custom_keys}

    guest.full_name = preset.get("name", guest.full_name)
    guest.email = preset.get("email", guest.email)
    guest.phone_or_chat = preset.get("phone_or_chat", guest.phone_or_chat)
    guest.custom_fields = {**guest.custom_fields, **custom}
    guest.save(update_fields=["full_name", "email", "phone_or_chat", "custom_fields", "updated_at"])
    apply_info_transition(guest, to="info_completed")
    write_audit(
        organization=guest.organization, event=guest.event, guest=guest,
        actor_type="guest", actor_id=str(guest.id),
        action="walkin.info_completed", result="success",
        previous_status="claimed_pending_info", new_status="info_completed",
        entry_token=token[:32],
    )
    return guest
```

- [x] **Step 3: serializers**

`/Users/vinei/Projects/eventgate/backend/apps/walkins/serializers.py`:

```python
from rest_framework import serializers


class WalkinNextRequestSerializer(serializers.Serializer):
    gate = serializers.CharField(max_length=64)
    scanner_label = serializers.CharField(max_length=64)


class WalkinNextResponseSerializer(serializers.Serializer):
    guest_id = serializers.UUIDField()
    entry_token = serializers.CharField()
    claim_url = serializers.CharField()


class WalkinClaimResponseSerializer(serializers.Serializer):
    guest_id = serializers.UUIDField()
    event_slug = serializers.CharField()
    org_slug = serializers.CharField()
    info_form_url = serializers.CharField()
```

- [x] **Step 4: views**

`/Users/vinei/Projects/eventgate/backend/apps/walkins/views.py`:

```python
from __future__ import annotations

from typing import ClassVar

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.devices.auth import SessionTokenAuthentication
from apps.walkins.serializers import (
    WalkinClaimResponseSerializer,
    WalkinNextRequestSerializer,
    WalkinNextResponseSerializer,
)
from apps.walkins.services import (
    build_claim_url,
    claim_walkin,
    complete_walkin_info,
    get_or_create_displayed,
)


class WalkinDisplayNextView(APIView):
    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = (AllowAny,)

    def post(self, request):
        device = getattr(request, "scanner_device", None)
        if not device or device.role != "walkin_display":
            return Response(
                {"detail": "This device cannot run the walk-in display."}, status=403,
            )
        ser = WalkinNextRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        guest, url = get_or_create_displayed(device=device, **ser.validated_data)
        return Response(WalkinNextResponseSerializer({
            "guest_id": guest.id, "entry_token": guest.entry_token, "claim_url": url,
        }).data)


class WalkinClaimView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request, org_slug, event_slug, token):
        from apps.checkins.services import CheckinFailure
        try:
            guest = claim_walkin(org_slug=org_slug, event_slug=event_slug, token=token)
        except CheckinFailure as exc:
            return Response(exc.body, status=exc.http_status)
        info_url = f"/e/{org_slug}/{event_slug}/info/{token}/"
        return Response(WalkinClaimResponseSerializer({
            "guest_id": guest.id, "event_slug": event_slug, "org_slug": org_slug,
            "info_form_url": info_url,
        }).data, status=status.HTTP_200_OK)


class WalkinInfoView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request, org_slug, event_slug, token):
        try:
            guest = complete_walkin_info(
                org_slug=org_slug, event_slug=event_slug, token=token, payload=request.data,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response({"guest_id": str(guest.id), "info_status": guest.info_status})
```

- [x] **Step 5: urls**

`/Users/vinei/Projects/eventgate/backend/apps/walkins/urls.py`:

```python
from django.urls import path

from apps.walkins.views import WalkinClaimView, WalkinDisplayNextView, WalkinInfoView

urlpatterns = [
    path("walkins/displays/next/", WalkinDisplayNextView.as_view(), name="walkin-display-next"),
    path(
        "e/<slug:org_slug>/<slug:event_slug>/claim/<str:token>/",
        WalkinClaimView.as_view(), name="walkin-claim",
    ),
    path(
        "e/<slug:org_slug>/<slug:event_slug>/info/<str:token>/",
        WalkinInfoView.as_view(), name="walkin-info",
    ),
]
```

Uncomment the `apps.walkins.urls` include in `backend/config/urls.py`.

- [x] **Step 6: Tests**

`/Users/vinei/Projects/eventgate/backend/tests/test_walkin_display_next.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.devices.services import create_device, complete_enrollment, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.models import Guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _display_session():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="W1", role="walkin_display")
    _, _ = complete_enrollment(enrollment_code=code)
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    return event, d, st


def test_next_creates_new_walkin():
    event, d, st = _display_session()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post("/api/v1/walkins/displays/next/", {"gate": "G1", "scanner_label": "S1"}, format="json")
    assert r.status_code == 200
    assert "entry_token" in r.data
    assert r.data["claim_url"].endswith(f"/claim/{r.data['entry_token']}/")
    g = Guest.objects.get(id=r.data["guest_id"])
    assert g.guest_type == "walk_in"
    assert g.entry_status == "displayed"


def test_next_returns_same_displayed_until_claimed():
    event, d, st = _display_session()
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r1 = c.post("/api/v1/walkins/displays/next/", {"gate": "G1", "scanner_label": "S1"}, format="json")
    r2 = c.post("/api/v1/walkins/displays/next/", {"gate": "G1", "scanner_label": "S1"}, format="json")
    assert r1.data["guest_id"] == r2.data["guest_id"]


def test_scanner_device_cannot_run_display():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, _ = complete_enrollment(enrollment_code=code)
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post("/api/v1/walkins/displays/next/", {"gate": "G1", "scanner_label": "S1"}, format="json")
    assert r.status_code == 403
```

`/Users/vinei/Projects/eventgate/backend/tests/test_walkin_claim.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.devices.services import create_device, complete_enrollment, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.models import Guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _mint_displayed_walkin():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="W1", role="walkin_display")
    _, _ = complete_enrollment(enrollment_code=code)
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post("/api/v1/walkins/displays/next/", {"gate": "G", "scanner_label": "S"}, format="json")
    return org, event, r.data["entry_token"]


def test_claim_transitions_walkin_to_checked_in():
    org, event, token = _mint_displayed_walkin()
    anon = APIClient()
    r = anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/{token}/")
    assert r.status_code == 200
    g = Guest.objects.get(entry_token=token)
    assert g.entry_status == "checked_in"
    assert g.info_status == "claimed_pending_info"
    assert AuditEvent.objects.filter(action="walkin.claim").count() == 1


def test_claim_is_idempotent():
    org, event, token = _mint_displayed_walkin()
    anon = APIClient()
    r1 = anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/{token}/")
    r2 = anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/{token}/")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.data["guest_id"] == r2.data["guest_id"]
    # Audit row appears once
    assert AuditEvent.objects.filter(action="walkin.claim").count() == 1


def test_claim_unknown_token_returns_404():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    anon = APIClient()
    r = anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/bogus/")
    assert r.status_code == 404
```

`/Users/vinei/Projects/eventgate/backend/tests/test_walkin_info.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.devices.services import create_device, complete_enrollment, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.events.services import seed_preset_fields
from apps.guests.models import Guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _claimed_walkin():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    seed_preset_fields(event)
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="W1", role="walkin_display")
    _, _ = complete_enrollment(enrollment_code=code)
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = c.post("/api/v1/walkins/displays/next/", {"gate": "G", "scanner_label": "S"}, format="json")
    token = r.data["entry_token"]
    anon = APIClient()
    anon.post(f"/api/v1/e/{org.slug}/{event.slug}/claim/{token}/")
    return org, event, token


def test_info_form_completes_and_persists_preset_and_custom():
    org, event, token = _claimed_walkin()
    anon = APIClient()
    r = anon.post(
        f"/api/v1/e/{org.slug}/{event.slug}/info/{token}/",
        {"name": "Bob", "email": "b@x.com", "phone_or_chat": "+123"},
        format="json",
    )
    assert r.status_code == 200
    g = Guest.objects.get(entry_token=token)
    assert g.full_name == "Bob"
    assert g.email == "b@x.com"
    assert g.info_status == "info_completed"


def test_info_form_missing_required_returns_400():
    org, event, token = _claimed_walkin()
    anon = APIClient()
    r = anon.post(
        f"/api/v1/e/{org.slug}/{event.slug}/info/{token}/",
        {"name": "Bob"}, format="json",
    )
    assert r.status_code == 400


def test_info_form_idempotent_after_completion():
    org, event, token = _claimed_walkin()
    anon = APIClient()
    anon.post(
        f"/api/v1/e/{org.slug}/{event.slug}/info/{token}/",
        {"name": "Bob", "email": "b@x.com", "phone_or_chat": "+1"}, format="json",
    )
    r2 = anon.post(
        f"/api/v1/e/{org.slug}/{event.slug}/info/{token}/",
        {"name": "Bob2", "email": "b2@x.com", "phone_or_chat": "+2"}, format="json",
    )
    assert r2.status_code == 200
    g = Guest.objects.get(entry_token=token)
    # First write wins — second call returns the existing record without overwriting.
    assert g.full_name == "Bob"
```

- [x] **Step 7: Migrate + run**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run python manage.py migrate && uv run pytest tests/test_walkin_display_next.py tests/test_walkin_claim.py tests/test_walkin_info.py
```

Expected: 9 tests pass; partial unique index in place.

- [x] **Step 8: Commit**

```bash
git add backend/ && git commit -m "feat(walkins): display-next, public claim, public info form"
```

---

## Task 11: Public event-detail endpoint

**TDD.** Anonymous. Returns name, slug, registration_open, walkins_enabled, status, and the EN+KM-labeled field list.

**Files:**
- Modify: `backend/apps/events/views.py` (add `PublicEventDetailView`)
- Modify: `backend/apps/events/urls.py`
- Create: `backend/tests/test_public_event_detail.py`

- [x] **Step 1: Test file**

`/Users/vinei/Projects/eventgate/backend/tests/test_public_event_detail.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def test_public_event_detail_anonymous():
    org = Organization.objects.create(name="O", slug="acme")
    event = Event.objects.create(
        organization=org, name="Conf 2026", slug="conf",
        venue="Phnom Penh", registration_open=True, walkins_enabled=True,
    )
    seed_preset_fields(event)
    RegistrationField.objects.create(
        event=event, field_key="company", label_en="Company", label_km="ក្រុមហ៊ុន",
        field_type="text", required=False, order_index=10,
    )
    anon = APIClient()
    r = anon.get("/api/v1/e/acme/conf/")
    assert r.status_code == 200
    body = r.data
    assert body["name"] == "Conf 2026"
    assert body["slug"] == "conf"
    assert body["org_slug"] == "acme"
    assert body["registration_open"] is True
    assert body["walkins_enabled"] is True
    assert body["venue"] == "Phnom Penh"
    field_keys = [f["field_key"] for f in body["fields"]]
    assert "name" in field_keys and "company" in field_keys
    company = next(f for f in body["fields"] if f["field_key"] == "company")
    assert company["label_en"] == "Company"
    assert company["label_km"] == "ក្រុមហ៊ុន"


def test_public_event_detail_404_for_unknown():
    anon = APIClient()
    r = anon.get("/api/v1/e/none/nope/")
    assert r.status_code == 404


def test_public_event_detail_does_not_leak_pin_hash():
    org = Organization.objects.create(name="O", slug="acme")
    event = Event.objects.create(
        organization=org, name="Conf 2026", slug="conf", event_pin_hash="secret-hash",
    )
    anon = APIClient()
    r = anon.get("/api/v1/e/acme/conf/")
    assert "event_pin_hash" not in r.data
```

- [x] **Step 2: view**

Append to `/Users/vinei/Projects/eventgate/backend/apps/events/views.py`:

```python
from rest_framework.permissions import AllowAny


class PublicEventDetailView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def get(self, request, org_slug, event_slug):
        from apps.events.models import Event
        from django.shortcuts import get_object_or_404
        event = get_object_or_404(
            Event, organization__slug=org_slug, slug=event_slug,
        )
        fields = [
            {
                "field_key": f.field_key,
                "label_en": f.label_en,
                "label_km": f.label_km,
                "field_type": f.field_type,
                "required": f.required,
                "options": f.options_json or [],
                "order_index": f.order_index,
            }
            for f in event.registration_fields.order_by("order_index", "field_key")
        ]
        return Response({
            "org_slug": org_slug,
            "slug": event.slug,
            "name": event.name,
            "venue": event.venue,
            "status": event.status,
            "starts_at": event.starts_at,
            "ends_at": event.ends_at,
            "timezone": event.timezone,
            "registration_open": event.registration_open,
            "walkins_enabled": event.walkins_enabled,
            "fields": fields,
        })
```

Add `ClassVar` to the existing `from typing import ClassVar` import if missing.

- [x] **Step 3: url**

In `/Users/vinei/Projects/eventgate/backend/apps/events/urls.py`, append:

```python
from apps.events.views import PublicEventDetailView

urlpatterns += [
    path(
        "e/<slug:org_slug>/<slug:event_slug>/",
        PublicEventDetailView.as_view(), name="public-event-detail",
    ),
]
```

```bash
uv run pytest tests/test_public_event_detail.py
```

Expected: 3 tests pass.

- [x] **Step 4: Commit**

```bash
git add backend/apps/events backend/tests/test_public_event_detail.py && git commit -m "feat(events): public event-detail endpoint (anonymous)"
```

---

## Task 12: Full backend test pass + provision Celery worker on Fly

This is two related sub-tasks. Run them together since the worker change touches Fly config.

**Files:**
- Modify: `backend/fly.toml`
- Create/Modify: `backend/Procfile`
- Verify: full `pytest` run is green

- [x] **Step 1: Run the whole suite locally**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest
```

Expected: 105 (Plan C baseline) + ~50 new tests ≈ **~155 passing**. Failing tests must be fixed in their owning task's commit; if a deviation surfaces, append it to the plan's deviations log at the end.

- [x] **Step 2: Add a Procfile**

`/Users/vinei/Projects/eventgate/backend/Procfile`:

```
web: gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --worker-class gthread --threads 4 --timeout 30 --access-logfile - --error-logfile -
worker: celery -A config worker --loglevel=INFO --concurrency=4
```

- [x] **Step 3: Update fly.toml with process groups**

Replace `/Users/vinei/Projects/eventgate/backend/fly.toml` with:

```toml
app = "eventgate-backend-staging"
primary_region = "sin"

[build]

[env]
  DJANGO_SETTINGS_MODULE = "config.settings.prod"
  PORT = "8000"

[processes]
  app = "gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --worker-class gthread --threads 4 --timeout 30 --access-logfile - --error-logfile -"
  worker = "celery -A config worker --loglevel=INFO --concurrency=4"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[[http_service.checks]]
  interval = "30s"
  timeout = "5s"
  grace_period = "10s"
  method = "GET"
  path = "/api/health/"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
  processes = ["app"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
  processes = ["worker"]
```

- [x] **Step 4: Deploy & scale**

```bash
cd /Users/vinei/Projects/eventgate/backend
flyctl deploy --remote-only
flyctl scale count app=1 worker=1 --app eventgate-backend-staging
```

Expected: two Machines, one per process group. `flyctl status` shows both healthy.

- [x] **Step 5: Drop the eager-mode secret**

```bash
flyctl secrets unset CELERY_TASK_ALWAYS_EAGER --app eventgate-backend-staging
```

- [x] **Step 6: Verify worker consumes tasks**

```bash
# tail worker logs in one terminal:
flyctl logs --app eventgate-backend-staging | grep -E "celery|worker|qr_email"

# in another terminal, trigger a registration:
curl -X POST https://eventgate-backend-staging.fly.dev/api/v1/e/<org>/<event>/register/ \
  -H 'Content-Type: application/json' \
  -d '{"name":"Worker Smoke","email":"vinei.dev@gmail.com","phone_or_chat":"+855"}'
```

Expected: web returns 201 within ~150ms (no longer blocked on Resend). Worker logs show the QR email task picked up + sent. `NotificationDispatch` row created in Postgres.

- [x] **Step 7: Commit**

```bash
git add backend/fly.toml backend/Procfile && git commit -m "ops(fly): add Celery worker process group + drop ALWAYS_EAGER"
```

---

## Task 13: Frontend — wire public registration page to use the real event name

**Files:**
- Modify: `frontend/lib/events.ts` (add `usePublicEventDetail` hook)
- Modify: `frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx`

- [x] **Step 1: Add the hook**

In `/Users/vinei/Projects/eventgate/frontend/lib/events.ts`, add:

```ts
export type PublicEventField = {
  field_key: string;
  label_en: string;
  label_km: string;
  field_type: 'text' | 'email' | 'phone' | 'textarea' | 'select';
  required: boolean;
  options: string[];
  order_index: number;
};

export type PublicEventDetail = {
  org_slug: string;
  slug: string;
  name: string;
  venue: string;
  status: string;
  registration_open: boolean;
  walkins_enabled: boolean;
  fields: PublicEventField[];
};

export function usePublicEventDetail(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ['public-event', orgSlug, eventSlug],
    queryFn: async (): Promise<PublicEventDetail> => {
      const res = await fetch(`/api/v1/e/${orgSlug}/${eventSlug}/`);
      if (!res.ok) throw new Error(`event not found`);
      return res.json();
    },
  });
}
```

- [x] **Step 2: Use the hook on the registration page**

In `/Users/vinei/Projects/eventgate/frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx`, replace the existing `eventSlug`-as-title rendering with:

```tsx
'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { RegistrationForm } from '@/components/guests/registration-form';
import { usePublicEventDetail } from '@/lib/events';

export default function RegisterPage() {
  const params = useParams<{ orgSlug: string; eventSlug: string }>();
  const { data, isLoading, isError } = usePublicEventDetail(params.orgSlug, params.eventSlug);
  const t = useTranslations('register');

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">{t('loading')}</div>;
  if (isError || !data) return <div className="p-6">{t('eventNotFound')}</div>;
  if (!data.registration_open) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold">{data.name}</h1>
        <p className="mt-2 text-muted-foreground">{t('registrationClosed')}</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{data.name}</h1>
        {data.venue ? <p className="text-sm text-muted-foreground">{data.venue}</p> : null}
      </header>
      <RegistrationForm
        orgSlug={params.orgSlug}
        eventSlug={params.eventSlug}
        fields={data.fields}
      />
    </div>
  );
}
```

(`RegistrationForm` already exists from Plan C; pass `fields` through and let it render the dynamic fields. Add the prop to the component if it's not already supported. Iterate inline.)

- [x] **Step 3: Add the new i18n keys**

In `frontend/lib/i18n/messages/en.json` under `register`:

```json
  "loading": "Loading event…",
  "eventNotFound": "Event not found.",
  "registrationClosed": "Registration is closed for this event."
```

In `frontend/lib/i18n/messages/km.json` (machine quality — flag in completion log):

```json
  "loading": "កំពុងផ្ទុក…",
  "eventNotFound": "រកមិនឃើញព្រឹត្តិការណ៍ទេ។",
  "registrationClosed": "ការចុះឈ្មោះត្រូវបានបិទ។"
```

- [x] **Step 4: Verify on staging**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm dev
# visit http://localhost:3000/e/<org>/<event>/register
```

Expected: real event name + venue in the header; dynamic fields rendered.

- [x] **Step 5: Commit + deploy**

```bash
git add frontend/ && git commit -m "feat(public-register): show real event name + dynamic fields from /e/<org>/<event>/ endpoint"
git push
```

---

## Task 14: Frontend — organizer pages: event settings (PIN) + device list

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/settings/page.tsx`
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/devices/page.tsx`
- Create: `frontend/lib/devices.ts`
- Create: `frontend/components/events/pin-management-card.tsx`
- Create: `frontend/components/events/device-table.tsx`
- Create: `frontend/components/events/device-create-dialog.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx` (link to settings + devices)

- [x] **Step 1: API hooks**

`/Users/vinei/Projects/eventgate/frontend/lib/devices.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Device = {
  id: string;
  label: string;
  role: 'scanner' | 'walkin_display' | 'helpdesk';
  gate: string;
  enrolled_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export function useDevices(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ['devices', orgSlug, eventSlug],
    queryFn: async (): Promise<Device[]> => {
      const r = await fetch(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/devices/`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error('failed');
      return r.json();
    },
  });
}

export function useCreateDevice(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { label: string; role: string; gate?: string }) => {
      const r = await fetch(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/devices/`, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('failed');
      return r.json() as Promise<{ device_id: string; enrollment_code: string }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices', orgSlug, eventSlug] }),
  });
}

export function useRevokeDevice(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const r = await fetch(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/devices/${deviceId}/`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!r.ok) throw new Error('failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices', orgSlug, eventSlug] }),
  });
}

export function useSetPin(orgSlug: string, eventSlug: string) {
  return useMutation({
    mutationFn: async (pin: string) => {
      const r = await fetch(
        `/api/v1/orgs/${orgSlug}/events/${eventSlug}/pin/set/`,
        { method: 'POST', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pin }) },
      );
      if (!r.ok) throw new Error('failed');
      return r.json();
    },
  });
}
```

- [x] **Step 2: Components + pages**

Build the three components and two pages. Keep them shadcn-flavored, terse, and use the hooks above. The PIN-management card shows the last-rotated timestamp and a "Set / rotate" form. The device-create dialog shows the one-time enrollment code with a Copy button and a "this code is shown only once" warning. The device table lists `label / role / gate / enrolled? / revoked?` with a revoke button.

(Implementation details intentionally lighter here — the controller builds these inline by reusing existing shadcn primitives in `frontend/components/ui/`. Reference the Plan C `events-table.tsx` style as a template.)

- [x] **Step 3: Manual verification**

```bash
cd /Users/vinei/Projects/eventgate/frontend && pnpm dev
# visit /orgs/<slug>/events/<eventSlug>/settings/ — set PIN
# visit /orgs/<slug>/events/<eventSlug>/devices/ — create a scanner device + a walkin_display device
# copy the enrollment codes for use in Task 16-17
```

- [x] **Step 4: Commit + deploy**

```bash
git add frontend/ && git commit -m "feat(organizer): event PIN settings + device list + enrollment dialog"
```

---

## Task 15: Frontend — scanner PWA shell + manifest + minimal service worker

**Files:**
- Create: `frontend/app/(scanner)/layout.tsx`
- Create: `frontend/app/manifest.ts`
- Create: `frontend/public/sw.js`
- Create: `frontend/lib/scanner/session.ts`
- Modify: `frontend/middleware.ts` (allow `/scanner/*` through auth gate)

- [x] **Step 1: Manifest**

`/Users/vinei/Projects/eventgate/frontend/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Eventgate Scanner',
    short_name: 'Scanner',
    description: 'Door-day check-in for Eventgate events',
    start_url: '/scanner/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

(Drop three placeholder PNGs into `public/icons/`; they don't need to be polished for Plan D — Plan H's pilot QA replaces them.)

- [x] **Step 2: Minimal service worker**

`/Users/vinei/Projects/eventgate/frontend/public/sw.js`:

```js
// Plan D: minimal SW. Caches static chunks only; no offline API.
// Plan E swaps this for Workbox + IndexedDB.
const STATIC_CACHE = 'eventgate-static-v1';

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll([
      '/manifest.webmanifest',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
    ])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);
  // Network-first for everything; only fall back to cache for known static assets.
  evt.respondWith(
    fetch(evt.request).catch(() => caches.match(evt.request).then((r) => r || Response.error())),
  );
});
```

- [x] **Step 3: Scanner session storage helpers**

`/Users/vinei/Projects/eventgate/frontend/lib/scanner/session.ts`:

```ts
const KEYS = {
  device: 'eventgate.scanner.device',
  session: 'eventgate.scanner.session',
} as const;

export type ScannerIdentity = {
  device_id: string;
  device_token: string;
  event_id: string;
  event_slug: string;
  org_slug: string;
  label: string;
  role: 'scanner' | 'walkin_display' | 'helpdesk';
};

export type ScannerSession = {
  session_token: string;
  expires_at: string;
};

export function loadDevice(): ScannerIdentity | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(KEYS.device);
  return raw ? JSON.parse(raw) : null;
}

export function saveDevice(id: ScannerIdentity) {
  localStorage.setItem(KEYS.device, JSON.stringify(id));
}

export function clearDevice() {
  localStorage.removeItem(KEYS.device);
  localStorage.removeItem(KEYS.session);
}

export function loadSession(): ScannerSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(KEYS.session);
  if (!raw) return null;
  const s = JSON.parse(raw) as ScannerSession;
  if (new Date(s.expires_at) < new Date()) {
    localStorage.removeItem(KEYS.session);
    return null;
  }
  return s;
}

export function saveSession(s: ScannerSession) {
  localStorage.setItem(KEYS.session, JSON.stringify(s));
}
```

- [x] **Step 4: Scanner layout (offline-aware shell + SW registration)**

`/Users/vinei/Projects/eventgate/frontend/app/(scanner)/layout.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { loadDevice } from '@/lib/scanner/session';

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (pathname.startsWith('/scanner/enroll')) return;
    const id = loadDevice();
    if (!id) router.replace('/scanner/enroll');
  }, [pathname, router]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center justify-between px-4 py-2 text-xs">
        <span>Eventgate Scanner</span>
        <span className={online ? 'text-green-400' : 'text-amber-400'}>
          {online ? 'online' : 'offline'}
        </span>
      </header>
      {children}
    </div>
  );
}
```

- [x] **Step 5: Allow `/scanner/*` through middleware**

In `/Users/vinei/Projects/eventgate/frontend/middleware.ts`, ensure the matcher excludes `/scanner/*` (the scanner has its own device auth, not user JWT). Add to the public-route list near the `/e/*` exclusion already added in Plan C.

- [x] **Step 6: Commit + deploy**

```bash
git add frontend/ && git commit -m "feat(scanner): PWA shell, manifest, minimal SW, session storage helpers"
```

---

## Task 16: Frontend — `(scanner)/enroll` + `(scanner)/unlock`

**Files:**
- Create: `frontend/app/(scanner)/enroll/page.tsx`
- Create: `frontend/app/(scanner)/unlock/page.tsx`
- Create: `frontend/components/scanner/enrollment-form.tsx`
- Create: `frontend/components/scanner/pin-entry.tsx`

- [x] **Step 1: Enroll page**

Paste-in enrollment code → POST `/api/v1/devices/enroll/` → save device identity → push to `/scanner/unlock`. If `BarcodeDetector` is available, also offer a "Scan enrollment QR" path (organizer screen in Task 14 should render the code as a QR).

- [x] **Step 2: Unlock page**

5-key PIN entry → POST `/api/v1/devices/unlock/` with `Authorization: Device <device_token>` → save session token → route to `/scanner/scan` (if role=scanner) or `/scanner/walkin` (if role=walkin_display).

- [x] **Step 3: Components**

Build with shadcn primitives. PIN entry uses six otp-style boxes. The unlock screen displays `device.label` + event name fetched via `/api/v1/e/<org>/<event>/` so the staffer can confirm they're unlocking the right event.

- [x] **Step 4: Verify**

```bash
pnpm dev
# visit /scanner/enroll, paste the enrollment code from Task 14
# verify redirect to /scanner/unlock
# enter PIN, verify redirect to /scanner/scan
```

- [x] **Step 5: Commit + deploy**

```bash
git add frontend/ && git commit -m "feat(scanner): enroll + PIN unlock pages"
```

---

## Task 17: Frontend — `(scanner)/scan` (camera + check-in)

**Files:**
- Create: `frontend/app/(scanner)/scan/page.tsx`
- Create: `frontend/lib/scanner/camera.ts`
- Create: `frontend/lib/scanner/api.ts`
- Create: `frontend/components/scanner/camera-view.tsx`
- Create: `frontend/components/scanner/result-card.tsx`
- Create: `frontend/components/scanner/manual-token-entry.tsx`

- [x] **Step 1: BarcodeDetector wrapper**

`/Users/vinei/Projects/eventgate/frontend/lib/scanner/camera.ts`: thin wrapper around the native `BarcodeDetector` API. Detect support; expose `startScanning(videoEl, onToken)`; fall back gracefully (returns `{ supported: false }`) so the page can render `ManualTokenEntry` instead.

- [x] **Step 2: Check-in API helper**

`/Users/vinei/Projects/eventgate/frontend/lib/scanner/api.ts`:

```ts
import { loadSession } from './session';

export type CheckinResult =
  | { status: 'success'; guest: { id: string; full_name: string; email: string; gate: string } }
  | { status: 'duplicate'; guest: { entry_status: string; full_name: string } }
  | { status: 'invalid'; detail: string };

export async function postCheckin(body: {
  token: string;
  gate: string;
  scanner_label: string;
  client_idempotency_key: string;
}): Promise<{ http: number; result: CheckinResult }> {
  const s = loadSession();
  if (!s) throw new Error('no_session');
  const r = await fetch('/api/v1/checkins/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${s.session_token}`,
    },
    body: JSON.stringify(body),
  });
  const result = (await r.json()) as CheckinResult;
  return { http: r.status, result };
}
```

- [x] **Step 3: `(scanner)/scan/page.tsx`**

Render `<CameraView />` (60%+ of screen); on token detected, POST to checkin, show full-screen `<ResultCard variant="success|duplicate|invalid" />` for 1.5s, then resume scanning. Maintain a `client_idempotency_key = crypto.randomUUID()` per scan attempt.

Handle 401 → session expired → push to `/scanner/unlock`.

- [x] **Step 4: Verify against staging**

```bash
# Deploy to Vercel preview, hit https://<preview>/scanner from a phone, scan a real QR from an emailed registration.
```

Expected: success card + Postgres shows `entry_status=checked_in`, `gate` and `scanner` populated.

- [x] **Step 5: Commit + deploy**

```bash
git add frontend/ && git commit -m "feat(scanner): camera + scan loop + checkin mutation"
```

---

## Task 18: Frontend — `(scanner)/walkin` (walk-in display)

**Files:**
- Create: `frontend/app/(scanner)/walkin/page.tsx`
- Create: `frontend/components/scanner/walkin-display.tsx`

- [x] **Step 1: Page logic**

On mount: POST `/api/v1/walkins/displays/next/` with `{ gate, scanner_label }` (defaulted from device.label / device.gate; let the staffer override). Render the returned `claim_url` as a large QR (use the existing `apps.common.qr.render_png` via a thin API helper — or `qrcode` JS lib, which avoids an extra round-trip). Poll the same endpoint every 5s; when the returned `entry_token` changes (i.e., previous one was claimed and a new one was minted), animate the new QR in.

- [x] **Step 2: Walk-in display component**

`/Users/vinei/Projects/eventgate/frontend/components/scanner/walkin-display.tsx`: full-screen QR centered, gate label small in the corner, "Show this code to a staffer" text below. Landscape-friendly on tablet.

- [x] **Step 3: Verify**

Open on a tablet → walkin display shows QR → guest scans (or paste URL into another phone) → `displayed → checked_in + claimed_pending_info` → display polls next → new QR appears.

- [x] **Step 4: Commit + deploy**

```bash
git add frontend/ && git commit -m "feat(scanner): walk-in QR display + auto-rotate"
```

---

## Task 19: Frontend — public walk-in claim + info form

**Files:**
- Create: `frontend/app/(public)/e/[orgSlug]/[eventSlug]/claim/[token]/page.tsx`
- Create: `frontend/app/(public)/e/[orgSlug]/[eventSlug]/info/[token]/page.tsx`
- Create: `frontend/lib/walkins.ts`
- Create: `frontend/components/walkins/claim-confirmation.tsx`
- Create: `frontend/components/walkins/info-form.tsx`

- [x] **Step 1: API hooks**

`/Users/vinei/Projects/eventgate/frontend/lib/walkins.ts`:

```ts
import { useMutation } from '@tanstack/react-query';

export function useClaim(orgSlug: string, eventSlug: string, token: string) {
  return useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/e/${orgSlug}/${eventSlug}/claim/${token}/`, {
        method: 'POST',
      });
      if (!r.ok) throw new Error('claim_failed');
      return r.json() as Promise<{ guest_id: string; info_form_url: string }>;
    },
  });
}

export function useCompleteInfo(orgSlug: string, eventSlug: string, token: string) {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const r = await fetch(`/api/v1/e/${orgSlug}/${eventSlug}/info/${token}/`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || 'info_failed');
      }
      return r.json();
    },
  });
}
```

- [x] **Step 2: Claim page**

`/Users/vinei/Projects/eventgate/frontend/app/(public)/e/[orgSlug]/[eventSlug]/claim/[token]/page.tsx`: on mount, call `useClaim().mutateAsync()`; on success, render `<ClaimConfirmation />` (large green check + "ENTRY CONFIRMED") + a CTA to the info form below.

Claim is idempotent server-side, so refreshing the page is safe.

- [x] **Step 3: Info page**

Renders the dynamic fields from `/api/v1/e/<org>/<event>/`. On submit, POST to `/api/v1/e/<org>/<event>/info/<token>/`. Render a calm "Thanks! Your info is saved." on success.

- [x] **Step 4: Verify on staging**

End-to-end: walkin display shows QR → scan it with a phone → land on `/e/<org>/<event>/claim/<token>` → see ENTRY CONFIRMED → tap "Complete info" → submit → DB shows `entry_status=checked_in, info_status=info_completed`.

- [x] **Step 5: Commit + deploy**

```bash
git add frontend/ && git commit -m "feat(walkin): public claim + post-entry info form pages (EN+KM)"
```

---

## Task 20: End-to-end staging verification + completion log

- [x] **Step 1: Full local test suite**

```bash
cd /Users/vinei/Projects/eventgate/backend && uv run pytest -q
```

Expected: ~155 tests passing.

- [x] **Step 2: Staging E2E scenario**

```text
1. Magic-link login as owner@... ✓
2. Create event "Plan D Smoke" with PIN "4242" ✓
3. /orgs/<o>/events/plan-d-smoke/devices/ → create:
   - Scanner device "Gate 1 Lane A" (role=scanner)
   - Walkin display "Lobby Tablet" (role=walkin_display)
   Copy both enrollment codes.
4. On phone: /scanner/enroll → paste scanner code → /scanner/unlock → enter 4242 → /scanner/scan
5. Public register a pre-reg guest → receive email with QR (via real Celery worker, not eager)
6. Scan the QR on the phone → "ENTRY CONFIRMED" success card → Postgres entry_status=checked_in ✓
7. Re-scan same QR → "Duplicate" amber card ✓
8. On tablet: /scanner/enroll → walkin display code → unlock with 4242 → /scanner/walkin → large QR shown
9. Scan the walk-in QR from another phone → land on /e/<o>/<e>/claim/<token> → "ENTRY CONFIRMED" → tap "Complete info" → submit Bob + email → "Thanks!" ✓
10. Tablet polls → new walk-in QR auto-appears ✓
11. Check Postgres: 1 pre-reg checked_in row, 1 walk-in checked_in row with info_status=info_completed.
12. Check AuditEvent table: rows for checkin.success, checkin.duplicate, walkin.display.create, walkin.claim, walkin.info_completed.
13. `flyctl logs | grep celery` shows the worker process picked up the QR email task.
```

- [x] **Step 3: Update handoff doc**

Append a short Plan D entry to `docs/handoff-2026-05-20.md` under "What's complete":

```
### Plan D — Walk-in flow + scanner PWA

apps.audit (skeleton), apps.devices (ScannerDevice + EventPinSession + DeviceTokenAuthentication + SessionTokenAuthentication), apps.checkins (POST /api/v1/checkins/ with advisory lock + idempotency + audit), apps.walkins (display-next + public claim + public info), apps.guests.transitions (single transition validator), public event-detail endpoint, event PIN set/rotate, organizer device list + create + revoke. Frontend (scanner) route group with PWA manifest + minimal SW, /scanner/{enroll,unlock,scan,walkin}. Public /e/<org>/<event>/{claim,info}/<token>/ pages. Celery worker process group on Fly; CELERY_TASK_ALWAYS_EAGER dropped.
```

- [x] **Step 4: Commit completion log**

Write the deviations + completion log at the end of THIS plan file (same structure as Plan C). Mark all tasks `- [x]`.

- [x] **Step 5: Final commit**

```bash
git add docs/ && git commit -m "docs(plan-d): mark complete; deviations + parking lot for Plan E"
git push
```

---

## Risks & Open Questions

| Risk | Mitigation |
|---|---|
| `BarcodeDetector` unavailable on iOS Safari (true for older versions) | Manual-token-entry fallback always reachable from the scan screen. PWA still works; just slower. |
| First Celery worker deploy might exceed Fly free-tier hour budget | `shared-cpu-1x@512mb` worker is a few cents/day; document in completion log. |
| Walk-in display polling at 5s is chatty | Acceptable at MVP; SSE / push deferred to Plan F per brief §3. |
| `pg_advisory_xact_lock` on token hash means concurrent walk-in claims on the SAME token serialize | Intended — that IS the lock. Different tokens are unaffected. |
| Idempotency cache is in Redis only; Redis flush means replay creates a fresh audit row | Acceptable at MVP; the partial unique index on `displayed` walk-ins still prevents the duplicate-displayed-walkin path. Pre-reg duplicates still 409 because the entry_status check fires. |
| Khmer i18n strings for scanner + walkin pages are machine-quality | Track in parking lot; bring to translator before pilot. |
| Walk-in URL uses `frontend-five-lovat-94.vercel.app` until a custom domain is chosen | `PUBLIC_BASE_URL` Fly secret can switch it; brand rename is still Plan-0 / pre-pilot. |
| Audit append-only is app-discipline only (no DB trigger yet) | Add `REVOKE UPDATE, DELETE` trigger in Plan F when the viewer ships. |
| Service worker is intentionally weak (static-only) | Plan E swaps to Workbox + IndexedDB. Document this in Plan E's brief. |

---

## Decision Heritage (newly locked-in this plan)

- **Device tokens are SHA-256-at-rest**, raw value returned exactly once (at enrollment). Same pattern as Plan B's magic-link tokens.
- **Session tokens are SHA-256-at-rest with 8h TTL.** Re-unlock with PIN to refresh. Tunable via `apps.devices.services.SESSION_TTL`.
- **Walk-in QR is a URL**, pre-reg QR is the raw token (brief Q11 + Appendix A).
- **`info_status` lifecycle for walk-ins:** created with `info_completed` default (so unclaimed walk-ins don't pollute the pending-info queue), explicitly reset to `claimed_pending_info` on claim, set back to `info_completed` on form submit. Mirrors the MVP state machine.
- **Audit append-only is app-discipline at Plan D**; DB trigger lands with the viewer in Plan F.
- **Idempotency scope = `checkins`** keyed by `client_idempotency_key`. Walk-in claim is idempotent by status-check (returning the existing record), not by key. Walk-in info form is idempotent by status-check (first write wins).
- **Walk-in claim audit fires once** per token (status-check before audit write).
- **Scanner device role gates endpoint access:** `role="scanner"` only check in pre-reg; `role="walkin_display"` only run the display; `role="helpdesk"` is reserved for Plan F.
- **Per-event PIN is bcrypt-hashed**, 4-char minimum at MVP. Owner/admin only can set/rotate.
- **Celery worker is its own Fly Machine**, not a thread inside the web process. `CELERY_TASK_ALWAYS_EAGER` is no longer set in production.

---

## Intentionally NOT in Plan D

- ❌ Offline scanner sync (service worker caches static only). **Plan E** (W9–10).
- ❌ Audit log viewer UI. **Plan F**.
- ❌ Manual review queue UI. **Plan F**.
- ❌ Dashboard polling counts. **Plan F**.
- ❌ Help-desk lane (search + manual check-in + override). **Plan F**.
- ❌ Telegram QR delivery. **Plan G**.
- ❌ CSV guest import. **Plan G**.
- ❌ Khmer translator review pass. **Pre-pilot QA** (Plan H), but the parking lot tracks it.
- ❌ Resend sender-domain verification. **Pre-pilot QA** (still requires manual dashboard work).
- ❌ Tighten Fly `ALLOWED_HOSTS`. **Plan H** pilot QA.
- ❌ Brand rename + domain swap. **Plan-0 task** before pilot.
- ❌ DB append-only trigger on `audit_events`. **Plan F**.
- ❌ Rate limit on `POST /api/v1/devices/enroll/` and PIN unlock. Acceptable at MVP since the enrollment code is single-use; document a `Plan F` follow-up to add per-IP rate limiting.

---

## Completion Log

- **Completed:** 2026-05-21
- **Backend:** ~50 new tests across `audit`, `devices`, `checkins`, `walkins`, `transitions`, `locks`/`idempotency`, event PIN, and public event detail. Full suite ~155 passing (up from Plan C's 105). New apps: `audit`, `devices`, `checkins`, `walkins`. New modules: `apps.guests.transitions`, `apps.common.locks`, `apps.common.idempotency`. `Event` gained PIN set/rotate (bcrypt-hashed). `Guest` gained the partial unique index `one_displayed_walkin_per_scope`.
- **Frontend:** PWA manifest + minimal static-asset service worker; `(scanner)` route group (enroll, unlock, scan, walkin); public `/e/<org>/<event>/{claim,info}/<token>/` pages; organizer `settings` (PIN) + `devices` pages. Camera path: `BarcodeDetector` API + manual-entry fallback. Walk-in display: `qrcode.react` SVG at 2048px scaled via CSS to 85% of the viewport.
- **Deploy:** `fly.toml` declares two process groups (`app` + `worker`) on separate Machines; `flyctl scale count app=1 worker=1`; `CELERY_TASK_ALWAYS_EAGER` Fly secret unset; `PUBLIC_BASE_URL` Fly secret set. Staging E2E verified end-to-end on 2026-05-21 — pre-reg scan (success + duplicate paths), walk-in display + claim + info, audit rows present for all five expected event types, real Celery worker process picked up the QR email task off the web request hot path.

### End-to-end verification (against staging, 2026-05-21)

All 13 steps from Task 20 Step 2 ran green:

```
 1. Magic-link login as owner                                  ✓
 2. Create event "Plan D Smoke" + set PIN "4242"               ✓
 3. Mint two devices (scanner + walkin_display)                ✓
 4. /scanner/enroll → /scanner/unlock → /scanner/scan          ✓
 5. Public register Alice → QR email arrives (via real worker) ✓
 6. Scan Alice's QR → green ENTRY CONFIRMED                    ✓ (entry_status=checked_in)
 7. Re-scan same QR → amber "Already checked in"               ✓
 8. Tablet: walkin display enroll + unlock + /scanner/walkin   ✓ (large QR)
 9. Scan walk-in QR from phone → green ENTRY CONFIRMED         ✓
    → tap "Complete my info" → form submits → "Thanks!"         ✓
10. Tablet polls (5s) → new walk-in QR auto-appears            ✓
11. Postgres: 1 pre-reg checked_in + 1 walk-in info_completed  ✓
12. AuditEvent: checkin.success, checkin.duplicate,            ✓
    walkin.display.create, walkin.claim, walkin.info_completed
13. flyctl logs | grep celery → worker picked up QR send       ✓
```

### Deviations from this plan

- **Hand-written migration regenerated.** Task 5's `apps/devices/migrations/0001_initial.py` was written by hand to mirror what `makemigrations` would produce. After concern about Fly schema drift, regenerated via `makemigrations` and verified SQL output identical via `sqlmigrate` (only operation ordering differed). Going forward: hand-written migrations should always be regenerate-and-diff'd before deploy.

- **Test isolation: `cache.clear()` autouse fixture.** `test_idempotency_first_call_returns_false` saw a cached payload from earlier checkin tests in the suite. Added an autouse `cache.clear()` fixture to `test_locks_idempotency.py`. For future plans: tests that exercise Redis-backed idempotency need explicit cache isolation per test.

- **Audit failure-path writes outside the transaction.** In `apps.checkins.services.perform_checkin`, the failure-path audit write is placed OUTSIDE the outer `transaction.atomic()` block so a `raise CheckinFailure` doesn't roll back the audit row. Critical for forensics — the plan didn't make this explicit; the implementer made it explicit in the code.

- **`guest.refresh_from_db()` inside `advisory_xact_lock`.** Without it, 5 concurrent threads would all see stale `registered_not_arrived` and all transition. The plan glossed this; implementer added the refresh inside the lock and called it out in code comments. `test_checkin_concurrency.py` exercises this directly.

- **Fly worker started as a "standby" Machine.** Initial deploy of the new worker process group on Fly placed the worker as a standby (started only on demand by the app process). Fix: `flyctl machine update <worker-machine-id> --restart=always --standby-for "" && flyctl machine start <worker-machine-id>`. Recorded in the parking lot — set `[processes].worker.restart=always` explicitly in `fly.toml` in Plan E so this doesn't recur.

- **mypy 7 pre-existing errors surfaced.** After `uv sync` pulled stricter django-stubs during Plan D execution, mypy began failing on 7 lines of Plan B-era code (`apps/common/models.py`, `apps/accounts/managers.py`, `apps/orgs/models.py`, `apps/accounts/services.py`, `apps/accounts/views.py`). Plan D's CI fixup added surgical `# type: ignore[code]` comments. Tracked in the parking lot — revisit when django-stubs improves or when explicit DRF model typing is introduced.

- **`react-hooks/set-state-in-effect` refactors.** ESLint's new (Next.js 16 / React 19) rule fired on `app/scanner/layout.tsx`, `app/scanner/enroll/page.tsx`, `app/scanner/unlock/page.tsx`. Resolved by refactoring localStorage reads to `useSyncExternalStore` (subscribes to native `storage` event + a custom `eventgate.scanner.changed` event for same-tab updates). The pattern lives in `lib/scanner/session.ts::useDeviceIdentity()`. For future SSR-safe localStorage reads, reuse this hook.

- **Camera scan-loop refs over deps.** `components/scanner/camera-view.tsx` uses refs for `paused`/`onScan` rather than the effect deps array, so the effect doesn't restart the camera on every render. Empty-frame counter (4 frames @ 250ms = 1s "no QR") clears last-seen, so the same QR can be re-scanned when a guest steps away and returns. Plan didn't specify this; implementer chose it.

- **`useClaim` modeled as `useQuery`, not `useMutation`.** The claim endpoint fires on page mount and is idempotent server-side (returns the existing claim for an already-claimed walk-in). `useQuery` with `retry: 1` fits better than `useMutation` for this "POST on mount, safe to retry" pattern. Plan said useMutation; deviation justified by idempotency contract.

- **Cross-app migration concern.** The partial unique index `one_displayed_walkin_per_scope` is defined on the `Guest` model, so the migration lives in `apps/guests/migrations/0002_walkin_displayed_unique.py` (not `walkins`). Walkins app has no models → no migrations folder needed. The plan implied a `walkins/migrations/` folder; corrected at execution time.

- **Vercel doesn't auto-deploy from GitHub pushes.** Was expected; isn't picking up new deployments. Worked around by running `pnpm dlx vercel@latest --prod --yes` manually after each frontend-touching push. Root cause not investigated — likely GitHub→Vercel webhook config drift. Tracked in the parking lot.

- **Vercel token expired mid-plan.** Required `pnpm dlx vercel@latest login` to re-auth via SSO before manual deploys resumed. Worth noting that the Vercel token pasted in earlier chat sessions is no longer the live one.

- **Handoff doc became load-bearing.** `docs/handoff-2026-05-20.md` is the canonical resume context for the project (referenced from project instructions). Plan D updated it to reflect the new endpoints, the new parking lot, and the new "Most likely next task: Plan E."

### Follow-ups for Plan E (parking lot)

- Workbox + Dexie for `(scanner)/scan` offline path (the headline of Plan E).
- IndexedDB cache of `Guest` rows fetched at enrollment time, ≤10k guests.
- Pending mutation sync queue with server-authoritative conflict resolution; conflicts route to manual review.
- Add a DB trigger to make `audit_events` truly append-only (REVOKE UPDATE, DELETE for the app role).
- Replace the placeholder PWA icons in `public/icons/` with branded versions once the brand name is picked.
- Rate-limit `POST /api/v1/devices/enroll/` (single-use codes already mitigate, but add per-IP cap).
- Khmer translation review for `messages/km.json` scanner + walkin keys.
- Resend sender-domain verification.
- Tighten Fly `ALLOWED_HOSTS` (still `*` post-Plan D).
- Manual-review CTA from the scanner (Plan F help-desk lane).
- Set `[processes].worker.restart=always` explicitly in `fly.toml` so the worker Machine doesn't deploy as standby.
- Investigate Vercel auto-deploy from GitHub (currently manual deploys per push).
- Pin prettier version in `frontend/package.json` to stop `format` / `format:check` drift between local and CI.
- Resolve the 7 mypy `# type: ignore` comments added during Plan D CI fixup (Plan B-era code).
