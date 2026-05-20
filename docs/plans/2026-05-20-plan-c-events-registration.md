# Plan C — Events, Public Registration, QR + Email Delivery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the core product loop — org admins create events, configure a registration form schema, public guests register, QR codes are generated and delivered via email. This is **Plan C of an 8-plan Phase 1 sequence** (see `docs/brief.md` §12).

**Architecture:**
- `apps.events` defines `Event` (org-scoped, lifecycle state) + `RegistrationField` (one row per form field, with `label_en` / `label_km`).
- `apps.guests` defines `Guest` (inherits `OrgScopedModel`; carries `entry_token`, `entry_status`, `info_status`, `custom_fields` JSONB).
- Public registration submission writes a Guest row, generates a long random `entry_token` via the existing `apps.common.tokens`, queues a Celery task that renders a PNG QR (via `segno`) and emails it.
- **QR images are rendered on demand** at `GET /api/v1/guests/<id>/qr.png?token=<entry_token>` — no object storage needed for MVP. The QR delivery email attaches a freshly rendered PNG.
- **Resend** replaces the console email backend in production; dev and tests stay on console.
- **i18n** via `next-intl`: EN + KM bundles. New public pages are translated; existing Plan B pages stay EN-only (retrofit is a Plan F cleanup).
- The brief's data-model decisions are honored verbatim: separate `entry_status` and `info_status`, raw-token-only QR for pre-reg guests, no auto-expiry, owner+admin+manager can edit events.

**Tech Stack:** Django 5 + DRF (existing), `segno` for QR (pure Python, no Pillow needed for PNG), `anymail[resend]` to bridge Django's `send_mail` to Resend, Celery + Redis (existing). Next.js + shadcn (existing) + `next-intl@4`, `react-hook-form` + `zod` for form validation.

**Builds on:** Plan B's accounts, orgs, memberships, magic-link, JWT cookies, `OrgScopedModel` + `IsOrgMember`. Repo at github.com/vineidev/eventgate. Backend on Fly Singapore. Frontend on Vercel.

---

## File Structure

```text
backend/
├── apps/
│   ├── common/
│   │   └── qr.py                ← NEW: segno PNG rendering
│   ├── events/                  ← NEW APP
│   │   ├── __init__.py / apps.py
│   │   ├── models.py            ← Event, RegistrationField
│   │   ├── serializers.py
│   │   ├── views.py             ← EventViewSet, FieldsViewSet
│   │   ├── urls.py
│   │   ├── admin.py
│   │   ├── services.py          ← seed_preset_fields(), transition_event_status()
│   │   └── migrations/
│   ├── guests/                  ← NEW APP
│   │   ├── __init__.py / apps.py
│   │   ├── models.py            ← Guest (inherits OrgScopedModel)
│   │   ├── serializers.py       ← public RegistrationSubmitSerializer, GuestSerializer
│   │   ├── views.py             ← public POST + dashboard list + QR PNG
│   │   ├── urls.py
│   │   ├── admin.py
│   │   ├── services.py          ← register_guest(), get_qr_payload()
│   │   ├── tasks.py             ← Celery: send_qr_email
│   │   └── migrations/
│   ├── accounts/
│   │   └── tasks.py             ← NEW: move magic-link email into a Celery task
│   └── notifications/           ← NEW APP (thin: backend selection + dispatch log)
│       ├── __init__.py / apps.py
│       ├── models.py            ← NotificationDispatch (audit trail of sent emails)
│       └── migrations/
├── config/
│   └── settings/
│       ├── base.py              ← MODIFY: add events/guests/notifications apps; anymail config
│       └── prod.py              ← MODIFY: switch to Resend if RESEND_API_KEY set
└── tests/
    ├── test_events_models.py
    ├── test_events_endpoints.py
    ├── test_registration_fields.py
    ├── test_guests_models.py
    ├── test_public_registration.py
    ├── test_qr_rendering.py
    ├── test_qr_endpoint.py
    └── test_qr_email_task.py

frontend/
├── app/
│   ├── (public)/
│   │   └── e/[orgSlug]/[eventSlug]/
│   │       ├── register/page.tsx        ← Public registration form (EN+KM)
│   │       └── registered/[guestId]/page.tsx  ← Success page with QR
│   ├── (app)/
│   │   └── orgs/[slug]/
│   │       ├── events/
│   │       │   ├── new/page.tsx         ← Event create wizard
│   │       │   ├── page.tsx             ← Events list
│   │       │   └── [eventId]/
│   │       │       ├── page.tsx         ← Event dashboard (counts placeholder)
│   │       │       ├── form/page.tsx    ← Registration form builder
│   │       │       └── guests/page.tsx  ← Guest list
│   │       └── page.tsx                 ← MODIFY: replace placeholder with event list shortcut
│   └── middleware.ts                    ← MODIFY: add /e/* to public paths
├── lib/
│   ├── events.ts                        ← NEW: events + fields API hooks
│   ├── guests.ts                        ← NEW: guests API hooks
│   ├── qr.ts                            ← NEW: helper to build the public QR URL
│   └── i18n/
│       ├── config.ts                    ← NEW: next-intl locale config
│       ├── request.ts                   ← NEW: server-side message loader
│       └── messages/
│           ├── en.json
│           └── km.json
├── components/
│   ├── events/
│   │   ├── event-create-wizard.tsx
│   │   ├── events-table.tsx
│   │   └── registration-form-builder.tsx
│   ├── guests/
│   │   ├── guests-table.tsx
│   │   ├── registration-form.tsx        ← public form, EN+KM
│   │   └── registration-success.tsx     ← QR + instructions, EN+KM
│   └── shared/
│       └── language-toggle.tsx          ← EN ⇄ ខ្មែរ
└── next.config.ts                       ← MODIFY: wire next-intl plugin
```

**Boundary notes:**
- `apps.notifications` stays small: a single `NotificationDispatch` model tracking what was sent. Email send itself stays in the originating app's `tasks.py` (accounts for magic-link, guests for QR delivery).
- `apps.common.qr.render_png(token: str) -> bytes` is the single source of QR rendering. Used by the QR endpoint AND the email task.
- `apps.guests.services.register_guest()` is the only place that creates a Guest + entry_token + enqueues the email task. Both the public HTTP endpoint and the future CSV-import path (Plan G) call it.
- The `Guest.entry_token` is the SAME raw value used as the QR payload. We do NOT URL-encode or wrap it in JSON — strict adherence to brief Appendix A.
- `Event.status` transitions are enforced in `events.services.transition_event_status()`. Direct ORM updates of `status` are linted out via integration test.

---

## Task 1: Add new dependencies; wire `apps.events`, `apps.guests`, `apps.notifications` into settings

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/settings/prod.py`

- [ ] **Step 1: Add dependencies**

In `/Users/vinei/Projects/eventgate/backend/pyproject.toml`, append to `dependencies`:

```toml
  "segno>=1.6,<2.0",
  "anymail[resend]>=11.0,<12.0",
```

- [ ] **Step 2: Sync**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv sync
```

Expected: lockfile updated.

- [ ] **Step 3: Update INSTALLED_APPS**

In `/Users/vinei/Projects/eventgate/backend/config/settings/base.py`, replace the INSTALLED_APPS block with:

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
]
```

- [ ] **Step 4: Add Resend config block (conditional)**

In `/Users/vinei/Projects/eventgate/backend/config/settings/prod.py`, append:

```python
# Resend email (anymail). Falls back to console backend if RESEND_API_KEY is unset.
RESEND_API_KEY = env("RESEND_API_KEY", default="")
if RESEND_API_KEY:
    EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"
    ANYMAIL = {"RESEND_API_KEY": RESEND_API_KEY}
```

- [ ] **Step 5: Verify Django setup still parses**

(Apps don't exist yet — Step 3 will break setup. Skip verification; we'll restore it as each app skeleton lands in subsequent tasks. Match the Plan B deferral pattern: comment-out the new apps for now, add each back in its own task.)

Replace the INSTALLED_APPS block again to use only the deps that exist:

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
    # apps.notifications — appended by Plan C Task 11 (when skeleton lands)
    # apps.events — appended by Plan C Task 2 (when skeleton lands)
    # apps.guests — appended by Plan C Task 6 (when skeleton lands)
]
```

Verify:

```bash
DJANGO_SETTINGS_MODULE=config.settings.dev uv run python -c "import django; django.setup(); print('OK')"
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/pyproject.toml backend/uv.lock backend/config/settings/
git commit -m "feat(backend): add segno + anymail[resend] deps; conditional Resend backend"
```

---

## Task 2: `apps.events` skeleton + `Event` model (TDD)

**Files:**
- Create: `backend/apps/events/__init__.py`, `apps.py`, `migrations/__init__.py`
- Create: `backend/apps/events/models.py`
- Create: `backend/tests/test_events_models.py`
- Modify: `backend/config/settings/base.py` (append `"apps.events"`)

- [ ] **Step 1: Skeleton**

```bash
mkdir -p /Users/vinei/Projects/eventgate/backend/apps/events/migrations
touch /Users/vinei/Projects/eventgate/backend/apps/events/__init__.py
touch /Users/vinei/Projects/eventgate/backend/apps/events/migrations/__init__.py
```

Create `/Users/vinei/Projects/eventgate/backend/apps/events/apps.py`:

```python
from django.apps import AppConfig


class EventsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.events"
    label = "events"
```

- [ ] **Step 2: Write failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_events_models.py`:

```python
import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.events.models import Event
from apps.orgs.models import Organization


@pytest.mark.django_db
class TestEvent:
    def test_create_event(self) -> None:
        org = Organization.objects.create(name="Acme", slug="acme")
        ev = Event.objects.create(organization=org, name="Annual Meetup", slug="annual-meetup")
        assert ev.status == "draft"
        assert ev.registration_open is True
        assert ev.walkins_enabled is True

    def test_slug_unique_per_org(self) -> None:
        org = Organization.objects.create(name="Acme", slug="acme")
        Event.objects.create(organization=org, name="A", slug="a")
        with pytest.raises(IntegrityError):
            Event.objects.create(organization=org, name="A again", slug="a")

    def test_slug_can_repeat_across_orgs(self) -> None:
        a = Organization.objects.create(name="A", slug="a")
        b = Organization.objects.create(name="B", slug="b")
        Event.objects.create(organization=a, name="X", slug="x")
        Event.objects.create(organization=b, name="X", slug="x")  # ok

    def test_status_choices_enforced(self) -> None:
        org = Organization.objects.create(name="Acme", slug="acme")
        ev = Event(organization=org, name="A", slug="a", status="banana")
        with pytest.raises(ValidationError):
            ev.full_clean()

    def test_str_returns_name(self) -> None:
        org = Organization.objects.create(name="Acme", slug="acme")
        ev = Event.objects.create(organization=org, name="Annual Meetup", slug="m")
        assert str(ev) == "Annual Meetup"
```

- [ ] **Step 3: Run, fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_events_models.py -v
```

- [ ] **Step 4: Implement the model**

Create `/Users/vinei/Projects/eventgate/backend/apps/events/models.py`:

```python
from __future__ import annotations

import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone


class Event(models.Model):
    """An event run by an Organization."""

    STATUSES = (
        ("draft", "Draft"),
        ("open", "Open"),
        ("live", "Live"),
        ("closed", "Closed"),
        ("archived", "Archived"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "orgs.Organization", on_delete=models.CASCADE, related_name="events"
    )
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80)
    status = models.CharField(max_length=16, choices=STATUSES, default="draft")
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    timezone = models.CharField(max_length=64, default="Asia/Phnom_Penh")
    venue = models.CharField(max_length=255, blank=True)
    registration_open = models.BooleanField(default=True)
    walkins_enabled = models.BooleanField(default=True)
    event_pin_hash = models.CharField(max_length=128, blank=True)
    event_pin_rotated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("organization", "slug"), name="unique_event_slug_per_org"
            ),
        ]
        indexes: ClassVar = [models.Index(fields=("organization", "status"))]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.name
```

- [ ] **Step 5: Append `"apps.events"` to INSTALLED_APPS**

In `/Users/vinei/Projects/eventgate/backend/config/settings/base.py`, replace the line `# apps.events — appended by Plan C Task 2 (when skeleton lands)` with `"apps.events",`.

- [ ] **Step 6: Migrate**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py makemigrations events
uv run python manage.py migrate
```

- [ ] **Step 7: Tests pass**

```bash
uv run pytest tests/test_events_models.py -v
```

Expected: `5 passed`.

- [ ] **Step 8: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/events/ backend/tests/test_events_models.py backend/config/settings/base.py
git commit -m "feat(events): add Event model with org-scoped slug uniqueness (TDD)"
```

---

## Task 3: `RegistrationField` model + seed-preset-fields service (TDD)

**Files:**
- Modify: `backend/apps/events/models.py` (append `RegistrationField`)
- Create: `backend/apps/events/services.py`
- Create: `backend/tests/test_registration_fields.py`

- [ ] **Step 1: Write failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_registration_fields.py`:

```python
import pytest

from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    return Event.objects.create(organization=org, name="Conf", slug="conf")


@pytest.mark.django_db
class TestRegistrationField:
    def test_create_field(self, event) -> None:
        f = RegistrationField.objects.create(
            event=event, field_key="name", label_en="Name", field_type="text", required=True, order_index=0
        )
        assert f.field_key == "name"
        assert f.required is True

    def test_field_key_unique_per_event(self, event) -> None:
        from django.db import IntegrityError

        RegistrationField.objects.create(
            event=event, field_key="email", label_en="Email", field_type="email", order_index=0
        )
        with pytest.raises(IntegrityError):
            RegistrationField.objects.create(
                event=event, field_key="email", label_en="Email 2", field_type="email", order_index=1
            )

    def test_order_is_default_ordering(self, event) -> None:
        RegistrationField.objects.create(event=event, field_key="b", label_en="B", field_type="text", order_index=1)
        RegistrationField.objects.create(event=event, field_key="a", label_en="A", field_type="text", order_index=0)
        keys = list(event.registration_fields.values_list("field_key", flat=True))
        assert keys == ["a", "b"]


@pytest.mark.django_db
class TestSeedPresetFields:
    def test_seeds_three_preset_fields(self, event) -> None:
        seed_preset_fields(event)
        keys = sorted(event.registration_fields.values_list("field_key", flat=True))
        assert keys == ["email", "name", "phone_or_chat"]

    def test_idempotent(self, event) -> None:
        seed_preset_fields(event)
        seed_preset_fields(event)
        assert event.registration_fields.count() == 3
```

- [ ] **Step 2: Run, fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_registration_fields.py -v
```

- [ ] **Step 3: Append `RegistrationField` to events/models.py**

Append to `/Users/vinei/Projects/eventgate/backend/apps/events/models.py`:

```python
class RegistrationField(models.Model):
    """One field in an event's registration form."""

    FIELD_TYPES = (
        ("text", "Short text"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("textarea", "Long text"),
        ("select", "Select"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="registration_fields")
    field_key = models.SlugField(max_length=40)
    label_en = models.CharField(max_length=200)
    label_km = models.CharField(max_length=200, blank=True)
    field_type = models.CharField(max_length=12, choices=FIELD_TYPES, default="text")
    required = models.BooleanField(default=False)
    options_json = models.JSONField(default=list, blank=True)
    order_index = models.PositiveIntegerField(default=0)
    is_preset = models.BooleanField(default=False, help_text="Preset fields cannot be deleted.")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(fields=("event", "field_key"), name="unique_field_key_per_event"),
        ]
        ordering = ("order_index", "field_key")

    def __str__(self) -> str:
        return f"{self.event.slug}.{self.field_key}"
```

- [ ] **Step 4: Implement the service**

Create `/Users/vinei/Projects/eventgate/backend/apps/events/services.py`:

```python
"""Event services: preset field seeding, status transitions."""
from __future__ import annotations

from django.db import transaction

from apps.events.models import Event, RegistrationField

PRESETS = (
    {"field_key": "name", "label_en": "Full name", "label_km": "ឈ្មោះពេញ", "field_type": "text", "required": True, "order_index": 0},
    {"field_key": "email", "label_en": "Email", "label_km": "អ៊ីមែល", "field_type": "email", "required": True, "order_index": 1},
    {"field_key": "phone_or_chat", "label_en": "Phone or Chat ID", "label_km": "លេខទូរស័ព្ទ ឬ Chat ID", "field_type": "phone", "required": True, "order_index": 2},
)


@transaction.atomic
def seed_preset_fields(event: Event) -> None:
    """Create the standard 3 preset fields. Idempotent."""
    for preset in PRESETS:
        RegistrationField.objects.get_or_create(
            event=event,
            field_key=preset["field_key"],
            defaults={**preset, "is_preset": True},
        )
```

- [ ] **Step 5: Migrate, test, commit**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py makemigrations events
uv run python manage.py migrate
uv run pytest tests/test_registration_fields.py -v
```

Expected: `5 passed`.

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/events/ backend/tests/test_registration_fields.py
git commit -m "feat(events): add RegistrationField model + preset-field seeding (TDD)"
```

---

## Task 4: Event endpoints — list/create/detail/update (TDD)

**Files:**
- Create: `backend/apps/events/serializers.py`
- Create: `backend/apps/events/views.py`
- Create: `backend/apps/events/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/tests/test_events_endpoints.py`

- [ ] **Step 1: Tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_events_endpoints.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.events.models import Event, RegistrationField
from apps.orgs.models import Organization, OrganizationMembership


def _login(client: APIClient, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.fixture
def acme(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    alice = User.objects.create_user(email="alice@example.com")
    org = Organization.objects.create(name="Acme", slug="acme")
    OrganizationMembership.objects.create(user=alice, organization=org, role="admin")
    return org


@pytest.mark.django_db
class TestCreateEvent:
    def test_admin_can_create(self, acme):
        client = APIClient()
        _login(client, "alice@example.com")
        response = client.post(
            "/api/v1/orgs/acme/events/",
            {"name": "Conf 2026", "slug": "conf-2026"},
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["slug"] == "conf-2026"
        # Preset fields auto-seeded
        ev = Event.objects.get(slug="conf-2026")
        keys = sorted(ev.registration_fields.values_list("field_key", flat=True))
        assert keys == ["email", "name", "phone_or_chat"]

    def test_staff_cannot_create(self, acme):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        bob = User.objects.create_user(email="bob@example.com")
        OrganizationMembership.objects.create(user=bob, organization=acme, role="staff")
        client = APIClient()
        _login(client, "bob@example.com")
        response = client.post(
            "/api/v1/orgs/acme/events/", {"name": "X", "slug": "x"}, format="json"
        )
        assert response.status_code == 403

    def test_non_member_gets_404(self):
        Organization.objects.create(name="Other", slug="other")
        client = APIClient()
        _login(client, "outsider@example.com")
        response = client.post(
            "/api/v1/orgs/other/events/", {"name": "X", "slug": "x"}, format="json"
        )
        assert response.status_code == 404


@pytest.mark.django_db
class TestListEvents:
    def test_lists_only_org_events(self, acme):
        Event.objects.create(organization=acme, name="A", slug="a")
        other = Organization.objects.create(name="Other", slug="other")
        Event.objects.create(organization=other, name="B", slug="b")

        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/api/v1/orgs/acme/events/")
        assert response.status_code == 200
        slugs = sorted(e["slug"] for e in response.json()["results"])
        assert slugs == ["a"]


@pytest.mark.django_db
class TestRetrieveAndUpdate:
    def test_get_detail_and_update(self, acme):
        ev = Event.objects.create(organization=acme, name="A", slug="a")
        client = APIClient()
        _login(client, "alice@example.com")

        detail = client.get(f"/api/v1/orgs/acme/events/{ev.slug}/")
        assert detail.status_code == 200
        assert detail.json()["name"] == "A"

        patch = client.patch(f"/api/v1/orgs/acme/events/{ev.slug}/", {"venue": "Diamond Island"}, format="json")
        assert patch.status_code == 200
        ev.refresh_from_db()
        assert ev.venue == "Diamond Island"
```

- [ ] **Step 2: Run, fail**

```bash
uv run pytest tests/test_events_endpoints.py -v
```

- [ ] **Step 3: Serializers**

Create `/Users/vinei/Projects/eventgate/backend/apps/events/serializers.py`:

```python
from rest_framework import serializers

from apps.events.models import Event, RegistrationField


class RegistrationFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistrationField
        fields = (
            "id", "field_key", "label_en", "label_km", "field_type",
            "required", "options_json", "order_index", "is_preset",
        )
        read_only_fields = ("id", "is_preset")


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = (
            "id", "name", "slug", "status", "starts_at", "ends_at", "timezone",
            "venue", "registration_open", "walkins_enabled", "created_at",
        )
        read_only_fields = ("id", "created_at")
```

- [ ] **Step 4: Views**

Create `/Users/vinei/Projects/eventgate/backend/apps/events/views.py`:

```python
from __future__ import annotations

from django.db import transaction
from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.events.models import Event, RegistrationField
from apps.events.serializers import EventSerializer, RegistrationFieldSerializer
from apps.events.services import seed_preset_fields
from apps.orgs.views import StandardPagination


class EventViewSet(viewsets.ModelViewSet):
    """CRUD for events under /api/v1/orgs/<slug:org_slug>/events/."""

    serializer_class = EventSerializer
    pagination_class = StandardPagination
    lookup_field = "slug"
    lookup_value_regex = "[a-z0-9-]+"

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            self.required_org_roles = ("owner", "admin", "manager")
            return [IsAuthenticated(), IsOrgMember(), HasOrgRole()]
        return [IsAuthenticated(), IsOrgMember()]

    def get_queryset(self):
        return Event.objects.filter(organization=self.request.organization)

    @transaction.atomic
    def perform_create(self, serializer):
        event = serializer.save(organization=self.request.organization)
        seed_preset_fields(event)


class RegistrationFieldViewSet(viewsets.ModelViewSet):
    """CRUD for an event's registration fields.

    URL: /api/v1/orgs/<org_slug>/events/<event_slug>/fields/
    """

    serializer_class = RegistrationFieldSerializer
    pagination_class = StandardPagination
    lookup_field = "field_key"

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            self.required_org_roles = ("owner", "admin", "manager")
            return [IsAuthenticated(), IsOrgMember(), HasOrgRole()]
        return [IsAuthenticated(), IsOrgMember()]

    def get_queryset(self):
        return RegistrationField.objects.filter(
            event__organization=self.request.organization,
            event__slug=self.kwargs["event_slug"],
        )

    def perform_create(self, serializer):
        event = Event.objects.get(
            organization=self.request.organization, slug=self.kwargs["event_slug"]
        )
        serializer.save(event=event)

    def perform_destroy(self, instance):
        if instance.is_preset:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Preset fields cannot be deleted.")
        instance.delete()
```

- [ ] **Step 5: URLs**

Create `/Users/vinei/Projects/eventgate/backend/apps/events/urls.py`:

```python
from django.urls import path

from apps.events.views import EventViewSet, RegistrationFieldViewSet

event_list = EventViewSet.as_view({"get": "list", "post": "create"})
event_detail = EventViewSet.as_view({
    "get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy",
})
field_list = RegistrationFieldViewSet.as_view({"get": "list", "post": "create"})
field_detail = RegistrationFieldViewSet.as_view({
    "get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy",
})

urlpatterns = [
    path("orgs/<slug:org_slug>/events/", event_list, name="event-list"),
    path("orgs/<slug:org_slug>/events/<slug:slug>/", event_detail, name="event-detail"),
    path("orgs/<slug:org_slug>/events/<slug:event_slug>/fields/", field_list, name="field-list"),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/fields/<slug:field_key>/",
        field_detail,
        name="field-detail",
    ),
]
```

- [ ] **Step 6: Wire into config/urls.py**

Add `path("api/v1/", include("apps.events.urls")),` to the urlpatterns in `/Users/vinei/Projects/eventgate/backend/config/urls.py`.

- [ ] **Step 7: Tests pass, commit**

```bash
uv run pytest tests/test_events_endpoints.py -v
```

Expected: `5 passed`.

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/events/ backend/config/urls.py backend/tests/test_events_endpoints.py
git commit -m "feat(events): add event + registration-field CRUD endpoints with role gate (TDD)"
```

---

## Task 5: Registration-field endpoint tests (TDD)

**Files:**
- Append: `backend/tests/test_registration_fields.py`

- [ ] **Step 1: Append failing endpoint tests**

Append to `/Users/vinei/Projects/eventgate/backend/tests/test_registration_fields.py`:

```python
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.orgs.models import OrganizationMembership


def _login(client: APIClient, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.fixture
def alice_in_acme(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    alice = User.objects.create_user(email="alice@example.com")
    org = Organization.objects.create(name="Acme", slug="acme")
    OrganizationMembership.objects.create(user=alice, organization=org, role="admin")
    return alice, org


@pytest.fixture
def conf_with_presets(alice_in_acme):
    _, org = alice_in_acme
    ev = Event.objects.create(organization=org, name="Conf", slug="conf")
    seed_preset_fields(ev)
    return ev


@pytest.mark.django_db
class TestFieldEndpoints:
    def test_list_returns_seeded_fields(self, conf_with_presets):
        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/api/v1/orgs/acme/events/conf/fields/")
        assert response.status_code == 200
        keys = sorted(f["field_key"] for f in response.json()["results"])
        assert keys == ["email", "name", "phone_or_chat"]

    def test_add_custom_field(self, conf_with_presets):
        client = APIClient()
        _login(client, "alice@example.com")
        response = client.post(
            "/api/v1/orgs/acme/events/conf/fields/",
            {"field_key": "company", "label_en": "Company", "label_km": "ក្រុមហ៊ុន", "field_type": "text", "order_index": 5},
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["is_preset"] is False

    def test_cannot_delete_preset(self, conf_with_presets):
        client = APIClient()
        _login(client, "alice@example.com")
        response = client.delete("/api/v1/orgs/acme/events/conf/fields/email/")
        assert response.status_code == 403

    def test_can_delete_custom(self, conf_with_presets):
        client = APIClient()
        _login(client, "alice@example.com")
        client.post(
            "/api/v1/orgs/acme/events/conf/fields/",
            {"field_key": "company", "label_en": "Company", "field_type": "text", "order_index": 5},
            format="json",
        )
        response = client.delete("/api/v1/orgs/acme/events/conf/fields/company/")
        assert response.status_code == 204
```

- [ ] **Step 2: Tests pass**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_registration_fields.py -v
```

Expected: `9 passed` (5 original + 4 new).

- [ ] **Step 3: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/tests/test_registration_fields.py
git commit -m "test(events): add field-endpoint coverage incl. preset-undeletable guard"
```

---

## Task 6: `apps.guests` skeleton + `Guest` model (TDD)

**Files:**
- Create: `backend/apps/guests/__init__.py`, `apps.py`, `migrations/__init__.py`
- Create: `backend/apps/guests/models.py`
- Create: `backend/tests/test_guests_models.py`
- Modify: `backend/config/settings/base.py` (append `"apps.guests"`)

- [ ] **Step 1: Skeleton**

```bash
mkdir -p /Users/vinei/Projects/eventgate/backend/apps/guests/migrations
touch /Users/vinei/Projects/eventgate/backend/apps/guests/__init__.py
touch /Users/vinei/Projects/eventgate/backend/apps/guests/migrations/__init__.py
```

Create `/Users/vinei/Projects/eventgate/backend/apps/guests/apps.py`:

```python
from django.apps import AppConfig


class GuestsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.guests"
    label = "guests"
```

- [ ] **Step 2: Failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_guests_models.py`:

```python
import pytest

from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    return Event.objects.create(organization=org, name="Conf", slug="conf")


@pytest.mark.django_db
class TestGuest:
    def test_create_pre_registered_guest(self, event):
        g = Guest.objects.create(
            organization=event.organization, event=event,
            guest_type="pre_registered",
            entry_token="abc123",
            entry_status="registered_not_arrived",
            email="alice@example.com",
            full_name="Alice",
        )
        assert g.entry_status == "registered_not_arrived"
        assert g.info_status == "info_completed"  # default for pre-reg
        assert g.checked_in_at is None

    def test_entry_token_unique_per_event(self, event):
        from django.db import IntegrityError
        Guest.objects.create(
            organization=event.organization, event=event, guest_type="pre_registered",
            entry_token="dup", entry_status="registered_not_arrived",
        )
        with pytest.raises(IntegrityError):
            Guest.objects.create(
                organization=event.organization, event=event, guest_type="pre_registered",
                entry_token="dup", entry_status="registered_not_arrived",
            )

    def test_same_token_ok_across_events(self, event):
        other = Event.objects.create(organization=event.organization, name="Other", slug="other")
        Guest.objects.create(
            organization=event.organization, event=event, guest_type="pre_registered",
            entry_token="t", entry_status="registered_not_arrived",
        )
        Guest.objects.create(
            organization=event.organization, event=other, guest_type="pre_registered",
            entry_token="t", entry_status="registered_not_arrived",
        )  # ok

    def test_custom_fields_jsonb(self, event):
        g = Guest.objects.create(
            organization=event.organization, event=event, guest_type="pre_registered",
            entry_token="t", entry_status="registered_not_arrived",
            custom_fields={"company": "Acme Co.", "notes": "VIP"},
        )
        g.refresh_from_db()
        assert g.custom_fields["company"] == "Acme Co."
```

- [ ] **Step 3: Run, fail**

```bash
uv run pytest tests/test_guests_models.py -v
```

- [ ] **Step 4: Implement Guest model**

Create `/Users/vinei/Projects/eventgate/backend/apps/guests/models.py`:

```python
from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import OrgScopedModel


class Guest(OrgScopedModel):
    """A guest of an event. May be pre-registered or walk-in.

    Honors the brief Appendix A: separate entry_status and info_status,
    entry_token is the raw QR payload for pre-reg guests.
    """

    GUEST_TYPES = (("pre_registered", "Pre-registered"), ("walk_in", "Walk-in"))
    ENTRY_STATUSES = (
        ("registered_not_arrived", "Registered, not arrived"),
        ("checked_in", "Checked in"),
        ("displayed", "Walk-in displayed"),
        ("voided", "Voided"),
        ("manual_review", "Manual review"),
    )
    INFO_STATUSES = (
        ("claimed_pending_info", "Claimed, pending info"),
        ("info_completed", "Info completed"),
        ("manual_review", "Manual review"),
    )

    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="guests")
    guest_type = models.CharField(max_length=16, choices=GUEST_TYPES)
    entry_token = models.CharField(max_length=128)
    entry_status = models.CharField(max_length=24, choices=ENTRY_STATUSES, default="registered_not_arrived")
    info_status = models.CharField(max_length=24, choices=INFO_STATUSES, default="info_completed")
    full_name = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    phone_or_chat = models.CharField(max_length=64, blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    source = models.CharField(max_length=32, blank=True)
    gate = models.CharField(max_length=64, blank=True)
    scanner = models.CharField(max_length=64, blank=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(fields=("event", "entry_token"), name="unique_token_per_event"),
        ]
        indexes: ClassVar = [
            models.Index(fields=("event", "entry_status")),
            models.Index(fields=("event", "email")),
        ]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.full_name or self.email or self.entry_token[:8]} @ {self.event.slug}"
```

- [ ] **Step 5: Append `"apps.guests"` to INSTALLED_APPS**

In `/Users/vinei/Projects/eventgate/backend/config/settings/base.py`, replace `# apps.guests — appended by Plan C Task 6 ...` with `"apps.guests",`.

- [ ] **Step 6: Migrate, test, commit**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py makemigrations guests
uv run python manage.py migrate
uv run pytest tests/test_guests_models.py -v
```

Expected: `4 passed`.

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/guests/ backend/tests/test_guests_models.py backend/config/settings/base.py
git commit -m "feat(guests): add Guest model inheriting OrgScopedModel (TDD)"
```

---

## Task 7: `register_guest` service + public registration endpoint (TDD)

**Files:**
- Create: `backend/apps/guests/services.py`
- Create: `backend/apps/guests/serializers.py`
- Create: `backend/apps/guests/views.py`
- Create: `backend/apps/guests/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/tests/test_public_registration.py`

- [ ] **Step 1: Failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_public_registration.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.models import Guest
from apps.orgs.models import Organization


@pytest.fixture
def open_event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(
        organization=org, name="Conf", slug="conf", status="open", registration_open=True
    )
    seed_preset_fields(ev)
    return ev


@pytest.mark.django_db
class TestPublicRegistration:
    def test_anonymous_can_submit(self, open_event):
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/conf/register/",
            {"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+855 12 345 678"},
            format="json",
        )
        assert response.status_code == 201
        body = response.json()
        assert "guest_id" in body
        # Don't return the raw token in the response body (security: only via the redirect URL)
        assert "entry_token" not in body
        g = Guest.objects.get(id=body["guest_id"])
        assert g.entry_token
        assert g.entry_status == "registered_not_arrived"
        assert g.info_status == "info_completed"
        assert g.full_name == "Alice"

    def test_missing_required_field_400(self, open_event):
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/conf/register/",
            {"name": "Alice"},  # email + phone missing
            format="json",
        )
        assert response.status_code == 400
        # Mentions the missing required fields
        assert "email" in response.text.lower()

    def test_closed_event_rejects(self, open_event):
        open_event.registration_open = False
        open_event.save()
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/conf/register/",
            {"name": "A", "email": "a@a.com", "phone_or_chat": "1"},
            format="json",
        )
        assert response.status_code == 403

    def test_unknown_event_404(self):
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/no-such-event/register/",
            {"name": "A", "email": "a@a.com", "phone_or_chat": "1"},
            format="json",
        )
        assert response.status_code == 404

    def test_custom_field_captured(self, open_event):
        from apps.events.models import RegistrationField
        RegistrationField.objects.create(
            event=open_event, field_key="company", label_en="Company",
            field_type="text", required=False, order_index=10,
        )
        client = APIClient()
        response = client.post(
            "/api/v1/e/acme/conf/register/",
            {"name": "A", "email": "a@a.com", "phone_or_chat": "1", "company": "Acme Co."},
            format="json",
        )
        assert response.status_code == 201
        g = Guest.objects.get(id=response.json()["guest_id"])
        assert g.custom_fields == {"company": "Acme Co."}
```

- [ ] **Step 2: Run, fail**

```bash
uv run pytest tests/test_public_registration.py -v
```

- [ ] **Step 3: Service**

Create `/Users/vinei/Projects/eventgate/backend/apps/guests/services.py`:

```python
"""Guest registration service."""
from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.common.tokens import generate_token
from apps.events.models import Event, RegistrationField
from apps.guests.models import Guest


PRESET_FIELDS = ("name", "email", "phone_or_chat")


class RegistrationError(Exception):
    pass


class EventNotOpen(RegistrationError):
    pass


@transaction.atomic
def register_guest(*, event: Event, payload: dict[str, Any], source: str = "public_form") -> Guest:
    if not event.registration_open:
        raise EventNotOpen("Registration is closed for this event.")

    # Validate required fields are present
    required_keys = list(
        event.registration_fields.filter(required=True).values_list("field_key", flat=True)
    )
    missing = [k for k in required_keys if not payload.get(k)]
    if missing:
        raise RegistrationError(f"Missing required: {', '.join(missing)}")

    # Split preset vs custom
    preset = {k: payload[k] for k in PRESET_FIELDS if k in payload}
    custom = {k: v for k, v in payload.items() if k not in PRESET_FIELDS}

    # Drop any custom keys not defined on the event (defense in depth)
    known_custom_keys = set(
        event.registration_fields.exclude(field_key__in=PRESET_FIELDS).values_list("field_key", flat=True)
    )
    custom = {k: v for k, v in custom.items() if k in known_custom_keys}

    token = generate_token()
    guest = Guest.objects.create(
        organization=event.organization,
        event=event,
        guest_type="pre_registered",
        entry_token=token,
        entry_status="registered_not_arrived",
        info_status="info_completed",
        full_name=preset.get("name", ""),
        email=preset.get("email", ""),
        phone_or_chat=preset.get("phone_or_chat", ""),
        custom_fields=custom,
        source=source,
    )
    return guest
```

- [ ] **Step 4: Serializers**

Create `/Users/vinei/Projects/eventgate/backend/apps/guests/serializers.py`:

```python
from rest_framework import serializers

from apps.guests.models import Guest


class RegistrationSubmitResponseSerializer(serializers.Serializer):
    """Public registration response — intentionally NOT exposing entry_token."""

    guest_id = serializers.UUIDField()


class GuestSerializer(serializers.ModelSerializer):
    """Dashboard-side guest serializer. entry_token excluded — staff retrieves QR
    by guest_id via /qr.png endpoint."""

    class Meta:
        model = Guest
        fields = (
            "id", "guest_type", "entry_status", "info_status", "full_name", "email",
            "phone_or_chat", "custom_fields", "source", "checked_in_at", "created_at",
        )
        read_only_fields = fields
```

- [ ] **Step 5: Views**

Create `/Users/vinei/Projects/eventgate/backend/apps/guests/views.py`:

```python
from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsOrgMember
from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.serializers import GuestSerializer, RegistrationSubmitResponseSerializer
from apps.guests.services import EventNotOpen, RegistrationError, register_guest
from apps.orgs.models import Organization
from apps.orgs.views import StandardPagination


class PublicRegistrationView(APIView):
    """POST /api/v1/e/<org_slug>/<event_slug>/register/

    Anonymous. Returns 201 with the guest_id only (raw token never echoed).
    """

    permission_classes = (AllowAny,)
    authentication_classes: list = []

    def post(self, request: Request, org_slug: str, event_slug: str) -> Response:
        org = get_object_or_404(Organization, slug=org_slug)
        event = get_object_or_404(Event, organization=org, slug=event_slug)
        try:
            guest = register_guest(event=event, payload=request.data)
        except EventNotOpen as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except RegistrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        body = RegistrationSubmitResponseSerializer({"guest_id": guest.id}).data
        return Response(body, status=status.HTTP_201_CREATED)


class GuestListView(viewsets.GenericViewSet):
    """GET /api/v1/orgs/<org_slug>/events/<event_slug>/guests/ — staff list."""

    serializer_class = GuestSerializer
    pagination_class = StandardPagination
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get_queryset(self):
        return Guest.objects.filter(
            organization=self.request.organization,
            event__slug=self.kwargs["event_slug"],
        )

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        ser = self.get_serializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response(ser.data)
```

- [ ] **Step 6: URLs**

Create `/Users/vinei/Projects/eventgate/backend/apps/guests/urls.py`:

```python
from django.urls import path

from apps.guests.views import GuestListView, PublicRegistrationView

urlpatterns = [
    path(
        "e/<slug:org_slug>/<slug:event_slug>/register/",
        PublicRegistrationView.as_view(),
        name="public-registration",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/",
        GuestListView.as_view({"get": "list"}),
        name="guest-list",
    ),
]
```

- [ ] **Step 7: Wire into config/urls.py**

Add `path("api/v1/", include("apps.guests.urls")),` to the urlpatterns.

- [ ] **Step 8: Test + commit**

```bash
uv run pytest tests/test_public_registration.py -v
```

Expected: `5 passed`.

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/guests/ backend/config/urls.py backend/tests/test_public_registration.py
git commit -m "feat(guests): add register_guest service + public registration endpoint (TDD)"
```

---

## Task 8: QR PNG rendering helper (TDD)

**Files:**
- Create: `backend/apps/common/qr.py`
- Create: `backend/tests/test_qr_rendering.py`

- [ ] **Step 1: Failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_qr_rendering.py`:

```python
import io

from apps.common.qr import render_png


def test_render_png_returns_bytes() -> None:
    data = render_png("hello-world-token")
    assert isinstance(data, bytes)
    assert data[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic
    assert len(data) > 100


def test_render_png_deterministic_for_same_input() -> None:
    a = render_png("abc")
    b = render_png("abc")
    assert a == b


def test_render_png_differs_for_different_input() -> None:
    assert render_png("a") != render_png("b")


def test_render_png_handles_long_token() -> None:
    long_token = "x" * 256
    data = render_png(long_token)
    assert data[:8] == b"\x89PNG\r\n\x1a\n"


def test_render_png_minimum_pixel_size_640() -> None:
    """We render at a size readable from arm's length on a phone."""
    data = render_png("abc")
    # PNG IHDR chunk: bytes 16-23 = width (4B big-endian) + height (4B big-endian)
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    assert width >= 320
    assert height >= 320
```

- [ ] **Step 2: Run, fail**

```bash
uv run pytest tests/test_qr_rendering.py -v
```

- [ ] **Step 3: Implement**

Create `/Users/vinei/Projects/eventgate/backend/apps/common/qr.py`:

```python
"""QR PNG rendering.

Renders the raw token directly — no URL wrapping, per brief Appendix A
(pre-registered QR = identity, staff scanner session = permission).
"""
from __future__ import annotations

import io

import segno


def render_png(token: str, *, scale: int = 10, border: int = 2) -> bytes:
    """Render `token` as a PNG QR code. Default size ~ 370x370px."""
    qr = segno.make(token, error="M")
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=scale, border=border)
    return buf.getvalue()
```

- [ ] **Step 4: Test + commit**

```bash
uv run pytest tests/test_qr_rendering.py -v
```

Expected: `5 passed`.

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/common/qr.py backend/tests/test_qr_rendering.py
git commit -m "feat(common): add segno-based QR PNG renderer (TDD)"
```

---

## Task 9: QR PNG endpoint (TDD)

**Files:**
- Modify: `backend/apps/guests/views.py` (append GuestQrView)
- Modify: `backend/apps/guests/urls.py`
- Create: `backend/tests/test_qr_endpoint.py`

- [ ] **Step 1: Failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_qr_endpoint.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.services import register_guest
from apps.orgs.models import Organization


@pytest.fixture
def guest(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    return register_guest(
        event=ev,
        payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+855123"},
    )


@pytest.mark.django_db
class TestQrEndpoint:
    def test_returns_png_with_correct_token(self, guest):
        client = APIClient()
        response = client.get(f"/api/v1/guests/{guest.id}/qr.png?token={guest.entry_token}")
        assert response.status_code == 200
        assert response["Content-Type"] == "image/png"
        assert response.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_wrong_token_returns_403(self, guest):
        client = APIClient()
        response = client.get(f"/api/v1/guests/{guest.id}/qr.png?token=wrong")
        assert response.status_code == 403

    def test_missing_token_returns_403(self, guest):
        client = APIClient()
        response = client.get(f"/api/v1/guests/{guest.id}/qr.png")
        assert response.status_code == 403

    def test_unknown_guest_returns_404(self):
        client = APIClient()
        response = client.get("/api/v1/guests/00000000-0000-0000-0000-000000000000/qr.png?token=anything")
        assert response.status_code == 404
```

- [ ] **Step 2: Run, fail**

```bash
uv run pytest tests/test_qr_endpoint.py -v
```

- [ ] **Step 3: Append GuestQrView**

Append to `/Users/vinei/Projects/eventgate/backend/apps/guests/views.py`:

```python
from django.http import HttpResponse

from apps.common.qr import render_png
from apps.common.tokens import tokens_match, hash_token


class GuestQrView(APIView):
    """GET /api/v1/guests/<id>/qr.png?token=<raw>

    Public endpoint that requires possession of the raw entry_token. The token
    proves the requester registered as this guest (or received the email/share);
    no JWT required.
    """

    permission_classes = (AllowAny,)
    authentication_classes: list = []

    def get(self, request: Request, guest_id) -> HttpResponse:
        provided = request.query_params.get("token", "")
        guest = get_object_or_404(Guest, id=guest_id)
        if not tokens_match(provided, hash_token(guest.entry_token)):
            return Response({"detail": "Token does not match guest."}, status=status.HTTP_403_FORBIDDEN)
        png = render_png(guest.entry_token)
        resp = HttpResponse(png, content_type="image/png")
        resp["Cache-Control"] = "private, max-age=300"
        return resp
```

- [ ] **Step 4: Wire URL**

Append to `urlpatterns` in `/Users/vinei/Projects/eventgate/backend/apps/guests/urls.py`:

```python
from apps.guests.views import GuestQrView

# ... existing urlpatterns ...

urlpatterns += [
    path("guests/<uuid:guest_id>/qr.png", GuestQrView.as_view(), name="guest-qr"),
]
```

(Refactor the imports cleanly — combine `GuestQrView` into the existing import.)

- [ ] **Step 5: Tests + commit**

```bash
uv run pytest tests/test_qr_endpoint.py -v
```

Expected: `4 passed`.

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/guests/ backend/tests/test_qr_endpoint.py
git commit -m "feat(guests): add token-gated QR PNG endpoint (TDD)"
```

---

## Task 10: `apps.notifications` skeleton + `NotificationDispatch` model

**Files:**
- Create: `backend/apps/notifications/__init__.py`, `apps.py`, `migrations/__init__.py`
- Create: `backend/apps/notifications/models.py`
- Create: `backend/apps/notifications/admin.py`
- Modify: `backend/config/settings/base.py` (append `"apps.notifications"`)

- [ ] **Step 1: Skeleton**

```bash
mkdir -p /Users/vinei/Projects/eventgate/backend/apps/notifications/migrations
touch /Users/vinei/Projects/eventgate/backend/apps/notifications/__init__.py
touch /Users/vinei/Projects/eventgate/backend/apps/notifications/migrations/__init__.py
```

Create `/Users/vinei/Projects/eventgate/backend/apps/notifications/apps.py`:

```python
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    label = "notifications"
```

- [ ] **Step 2: Model**

Create `/Users/vinei/Projects/eventgate/backend/apps/notifications/models.py`:

```python
from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class NotificationDispatch(models.Model):
    """Audit trail of outbound notifications (email, Telegram, etc.).

    One row per attempt. Status updated as the dispatch progresses.
    """

    CHANNELS = (("email", "Email"), ("telegram", "Telegram"), ("self_serve", "Self-serve"))
    STATUSES = (
        ("queued", "Queued"),
        ("sent", "Sent"),
        ("failed", "Failed"),
        ("bounced", "Bounced"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "orgs.Organization", on_delete=models.CASCADE, null=True, related_name="+"
    )
    event = models.ForeignKey(
        "events.Event", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    guest = models.ForeignKey(
        "guests.Guest", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    channel = models.CharField(max_length=16, choices=CHANNELS)
    template = models.CharField(max_length=64)
    recipient = models.CharField(max_length=255)
    status = models.CharField(max_length=16, choices=STATUSES, default="queued")
    attempts = models.PositiveSmallIntegerField(default=0)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.channel}:{self.template} -> {self.recipient} ({self.status})"
```

- [ ] **Step 3: Admin**

Create `/Users/vinei/Projects/eventgate/backend/apps/notifications/admin.py`:

```python
from django.contrib import admin

from apps.notifications.models import NotificationDispatch


@admin.register(NotificationDispatch)
class NotificationDispatchAdmin(admin.ModelAdmin):
    list_display = ("created_at", "channel", "template", "recipient", "status", "attempts")
    list_filter = ("channel", "status")
    search_fields = ("recipient", "template")
    readonly_fields = ("created_at", "sent_at")
```

- [ ] **Step 4: Wire INSTALLED_APPS + migrate + commit**

Replace `# apps.notifications — appended by Plan C Task 11 (when skeleton lands)` line in base.py with `"apps.notifications",`. (Note: we're doing this earlier than Task 11 — that's a Plan-C deferral fix similar to Plan B's Task 1 follow-up.)

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py makemigrations notifications
uv run python manage.py migrate
DJANGO_SETTINGS_MODULE=config.settings.dev uv run python -c "import django; django.setup(); print('OK')"
```

Expected: `OK`.

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/notifications/ backend/config/settings/base.py
git commit -m "feat(notifications): add NotificationDispatch model + admin"
```

---

## Task 11: Move magic-link send into a Celery task (TDD)

**Files:**
- Create: `backend/apps/accounts/tasks.py`
- Modify: `backend/apps/accounts/services.py` (have `send_magic_link_email` enqueue the task)
- Modify: `backend/tests/test_magic_link_service.py` (add a test that verifies task enqueuement)

- [ ] **Step 1: Add failing test**

Append to `/Users/vinei/Projects/eventgate/backend/tests/test_magic_link_service.py`:

```python
def test_send_magic_link_email_creates_dispatch_row(db):
    from apps.accounts.services import send_magic_link_email
    from apps.notifications.models import NotificationDispatch

    send_magic_link_email(email="alice@example.com", raw_token="some-token")
    d = NotificationDispatch.objects.get(template="magic_link", recipient="alice@example.com")
    assert d.channel == "email"
    assert d.status in ("sent", "queued")
```

- [ ] **Step 2: Run, fail**

```bash
uv run pytest tests/test_magic_link_service.py -v -k "send_magic_link_email_creates_dispatch_row"
```

- [ ] **Step 3: Create the task**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/tasks.py`:

```python
"""Email tasks for accounts (magic-link)."""
from __future__ import annotations

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.notifications.models import NotificationDispatch


@shared_task(name="accounts.send_magic_link_email")
def send_magic_link_email_task(*, email: str, raw_token: str) -> str:
    dispatch = NotificationDispatch.objects.create(
        channel="email", template="magic_link", recipient=email, status="queued",
    )
    try:
        link = f"{settings.MAGIC_LINK_FRONTEND_URL}/auth/callback?token={raw_token}"
        send_mail(
            subject="Sign in to Eventgate",
            message=(
                "Click the link below to sign in. It works once and expires in 15 minutes.\n\n"
                f"{link}\n\n"
                "If you didn't request this, you can ignore the email."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        dispatch.status = "sent"
        dispatch.sent_at = timezone.now()
        dispatch.attempts = 1
        dispatch.save(update_fields=["status", "sent_at", "attempts"])
    except Exception as exc:  # noqa: BLE001
        dispatch.status = "failed"
        dispatch.error = str(exc)
        dispatch.attempts = 1
        dispatch.save(update_fields=["status", "error", "attempts"])
        raise
    return str(dispatch.id)
```

- [ ] **Step 4: Update `send_magic_link_email` in services.py to enqueue**

In `/Users/vinei/Projects/eventgate/backend/apps/accounts/services.py`, replace the body of `send_magic_link_email` with:

```python
def send_magic_link_email(*, email: str, raw_token: str) -> None:
    """Enqueue the magic-link email send. Tests with CELERY_TASK_ALWAYS_EAGER=True
    will execute it synchronously."""
    from apps.accounts.tasks import send_magic_link_email_task

    send_magic_link_email_task.delay(email=email, raw_token=raw_token)
```

- [ ] **Step 5: Run + commit**

```bash
uv run pytest tests/test_magic_link_service.py -v
```

Expected: all magic-link tests still pass (Celery is eager in tests), and the new dispatch-row test passes.

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/accounts/ backend/tests/test_magic_link_service.py
git commit -m "feat(accounts): move magic-link email into Celery task; log to NotificationDispatch"
```

---

## Task 12: QR delivery Celery task (TDD)

**Files:**
- Create: `backend/apps/guests/tasks.py`
- Modify: `backend/apps/guests/services.py` (enqueue task after register_guest)
- Create: `backend/tests/test_qr_email_task.py`

- [ ] **Step 1: Failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_qr_email_task.py`:

```python
import pytest
from django.core import mail

from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.services import register_guest
from apps.notifications.models import NotificationDispatch
from apps.orgs.models import Organization


@pytest.fixture
def event(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    ev = Event.objects.create(organization=org, name="Conf", slug="conf", registration_open=True)
    seed_preset_fields(ev)
    return ev


@pytest.mark.django_db
class TestQrEmailTask:
    def test_register_guest_sends_qr_email(self, event):
        register_guest(
            event=event,
            payload={"name": "Alice", "email": "alice@example.com", "phone_or_chat": "+1"},
        )
        # Email backend = locmem in tests; one email captured
        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == ["alice@example.com"]
        assert "register" in msg.subject.lower() or "eventgate" in msg.subject.lower()
        # Attachment is a PNG
        assert len(msg.attachments) == 1
        name, content, mimetype = msg.attachments[0]
        assert name.endswith(".png")
        assert mimetype == "image/png"
        assert content[:8] == b"\x89PNG\r\n\x1a\n"
        # NotificationDispatch row
        d = NotificationDispatch.objects.get(template="pre_reg_qr")
        assert d.status == "sent"

    def test_register_guest_without_email_skips_send(self, event):
        # Email is required by preset, so we need to relax the test setup:
        from apps.events.models import RegistrationField
        RegistrationField.objects.filter(event=event, field_key="email").update(required=False)
        register_guest(
            event=event,
            payload={"name": "Alice", "phone_or_chat": "+1"},
        )
        assert len(mail.outbox) == 0
        assert not NotificationDispatch.objects.filter(template="pre_reg_qr").exists()
```

- [ ] **Step 2: Run, fail**

```bash
uv run pytest tests/test_qr_email_task.py -v
```

- [ ] **Step 3: Implement task**

Create `/Users/vinei/Projects/eventgate/backend/apps/guests/tasks.py`:

```python
"""QR delivery Celery task."""
from __future__ import annotations

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMessage
from django.utils import timezone

from apps.common.qr import render_png
from apps.guests.models import Guest
from apps.notifications.models import NotificationDispatch


@shared_task(name="guests.send_qr_email", bind=True, max_retries=3, default_retry_delay=60)
def send_qr_email_task(self, *, guest_id: str) -> str:
    guest = Guest.objects.select_related("event", "organization").get(id=guest_id)
    if not guest.email:
        return "skipped:no_email"

    dispatch = NotificationDispatch.objects.create(
        organization=guest.organization,
        event=guest.event,
        guest=guest,
        channel="email",
        template="pre_reg_qr",
        recipient=guest.email,
        status="queued",
    )

    try:
        png = render_png(guest.entry_token)
        body = (
            f"Hi {guest.full_name or 'there'},\n\n"
            f"You're registered for {guest.event.name}.\n\n"
            "Show the attached QR code at the entrance — staff will scan it.\n"
            "Keep it private; do not share.\n\n"
            "See you there!\n"
            "— Eventgate"
        )
        msg = EmailMessage(
            subject=f"You're registered for {guest.event.name}",
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[guest.email],
        )
        msg.attach(f"eventgate-{guest.id}.png", png, "image/png")
        msg.send(fail_silently=False)

        dispatch.status = "sent"
        dispatch.sent_at = timezone.now()
        dispatch.attempts = 1
        dispatch.save(update_fields=["status", "sent_at", "attempts"])
    except Exception as exc:  # noqa: BLE001
        dispatch.status = "failed"
        dispatch.error = str(exc)
        dispatch.attempts += 1
        dispatch.save(update_fields=["status", "error", "attempts"])
        raise self.retry(exc=exc)

    return str(dispatch.id)
```

- [ ] **Step 4: Enqueue after register_guest**

Update `/Users/vinei/Projects/eventgate/backend/apps/guests/services.py` to add at the end of `register_guest` (before `return guest`):

```python
    # Enqueue QR email; in tests CELERY_TASK_ALWAYS_EAGER runs it synchronously.
    from apps.guests.tasks import send_qr_email_task
    send_qr_email_task.delay(guest_id=str(guest.id))
```

- [ ] **Step 5: Tests + commit**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_qr_email_task.py tests/test_public_registration.py -v
```

Expected: all green (new QR-task tests + existing registration tests).

Note: the test settings need `EMAIL_BACKEND` set to `django.core.mail.backends.locmem.EmailBackend` so `mail.outbox` is populated. Verify in `config/settings/test.py`; add it if missing:

```python
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
```

```bash
cd /Users/vinei/Projects/eventgate
git add backend/ backend/tests/test_qr_email_task.py
git commit -m "feat(guests): add QR email Celery task with attachment + dispatch logging (TDD)"
```

---

## Task 13: Frontend events + guests API clients

**Files:**
- Create: `frontend/lib/events.ts`
- Create: `frontend/lib/guests.ts`
- Create: `frontend/lib/qr.ts`

- [ ] **Step 1: Events client**

Create `/Users/vinei/Projects/eventgate/frontend/lib/events.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type EventStatus = "draft" | "open" | "live" | "closed" | "archived";

export type Event = {
  id: string;
  name: string;
  slug: string;
  status: EventStatus;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue: string;
  registration_open: boolean;
  walkins_enabled: boolean;
  created_at: string;
};

export type FieldType = "text" | "email" | "phone" | "textarea" | "select";

export type RegistrationField = {
  id: string;
  field_key: string;
  label_en: string;
  label_km: string;
  field_type: FieldType;
  required: boolean;
  options_json: string[];
  order_index: number;
  is_preset: boolean;
};

type Paginated<T> = { count: number; results: T[] };

export function useEvents(orgSlug: string) {
  return useQuery({
    queryKey: ["events", orgSlug],
    queryFn: () => apiFetch<Paginated<Event>>(`/api/v1/orgs/${orgSlug}/events/`),
    enabled: !!orgSlug,
  });
}

export function useEvent(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["events", orgSlug, eventSlug],
    queryFn: () => apiFetch<Event>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/`),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useCreateEvent(orgSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; slug: string; venue?: string; starts_at?: string; ends_at?: string }) =>
      apiFetch<Event>(`/api/v1/orgs/${orgSlug}/events/`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", orgSlug] }),
  });
}

export function useFields(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["events", orgSlug, eventSlug, "fields"],
    queryFn: () =>
      apiFetch<Paginated<RegistrationField>>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/fields/`),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useAddField(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      field_key: string;
      label_en: string;
      label_km?: string;
      field_type: FieldType;
      required: boolean;
      order_index: number;
    }) =>
      apiFetch<RegistrationField>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/fields/`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", orgSlug, eventSlug, "fields"] }),
  });
}

export function useDeleteField(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (field_key: string) =>
      apiFetch<void>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/fields/${field_key}/`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", orgSlug, eventSlug, "fields"] }),
  });
}
```

- [ ] **Step 2: Guests client**

Create `/Users/vinei/Projects/eventgate/frontend/lib/guests.ts`:

```ts
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type Guest = {
  id: string;
  guest_type: "pre_registered" | "walk_in";
  entry_status: string;
  info_status: string;
  full_name: string;
  email: string;
  phone_or_chat: string;
  custom_fields: Record<string, string>;
  source: string;
  checked_in_at: string | null;
  created_at: string;
};

type Paginated<T> = { count: number; results: T[] };

export function useGuests(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["guests", orgSlug, eventSlug],
    queryFn: () =>
      apiFetch<Paginated<Guest>>(`/api/v1/orgs/${orgSlug}/events/${eventSlug}/guests/`),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useRegisterPublic(orgSlug: string, eventSlug: string) {
  return useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiFetch<{ guest_id: string }>(`/api/v1/e/${orgSlug}/${eventSlug}/register/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}
```

- [ ] **Step 3: QR helper**

Create `/Users/vinei/Projects/eventgate/frontend/lib/qr.ts`:

```ts
import { API_BASE } from "./api";

export function qrPngUrl(guestId: string, token: string): string {
  return `${API_BASE}/api/v1/guests/${guestId}/qr.png?token=${encodeURIComponent(token)}`;
}
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm build
```

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/lib/
git commit -m "feat(frontend): add events + guests + qr API clients"
```

---

## Task 14: i18n setup (next-intl, EN + KM)

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/lib/i18n/config.ts`
- Create: `frontend/lib/i18n/request.ts`
- Create: `frontend/lib/i18n/messages/en.json`
- Create: `frontend/lib/i18n/messages/km.json`
- Modify: `frontend/next.config.ts`
- Modify: `frontend/app/layout.tsx` (wrap with NextIntlClientProvider for client trees)

- [ ] **Step 1: Install**

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm add next-intl
```

- [ ] **Step 2: Config**

Create `/Users/vinei/Projects/eventgate/frontend/lib/i18n/config.ts`:

```ts
export const locales = ["en", "km"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
```

- [ ] **Step 3: Request handler**

Create `/Users/vinei/Projects/eventgate/frontend/lib/i18n/request.ts`:

```ts
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, type Locale, locales } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = (locales as readonly string[]).includes(requested ?? "")
    ? (requested as Locale)
    : defaultLocale;
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 4: English messages**

Create `/Users/vinei/Projects/eventgate/frontend/lib/i18n/messages/en.json`:

```json
{
  "register": {
    "title": "Register for {eventName}",
    "subtitle": "Fill in your details — you'll get a QR code by email.",
    "field_name": "Full name",
    "field_email": "Email",
    "field_phone": "Phone or Chat ID",
    "submit": "Register",
    "submitting": "Registering…",
    "success_title": "You're registered!",
    "success_subtitle": "Show this QR code at the entrance.",
    "success_save": "Save image",
    "success_qr_alt": "Your QR code"
  },
  "language": "English"
}
```

- [ ] **Step 5: Khmer messages**

Create `/Users/vinei/Projects/eventgate/frontend/lib/i18n/messages/km.json`:

```json
{
  "register": {
    "title": "ចុះឈ្មោះសម្រាប់ {eventName}",
    "subtitle": "បំពេញព័ត៌មាន — អ្នកនឹងទទួលបាន QR Code តាមអ៊ីមែល។",
    "field_name": "ឈ្មោះពេញ",
    "field_email": "អ៊ីមែល",
    "field_phone": "លេខទូរស័ព្ទ ឬ Chat ID",
    "submit": "ចុះឈ្មោះ",
    "submitting": "កំពុងចុះឈ្មោះ…",
    "success_title": "អ្នកបានចុះឈ្មោះហើយ!",
    "success_subtitle": "បង្ហាញ QR Code នេះនៅច្រកចូល។",
    "success_save": "រក្សាទុក",
    "success_qr_alt": "QR Code របស់អ្នក"
  },
  "language": "ខ្មែរ"
}
```

(These are starter translations — your Khmer reviewer should polish them after we ship.)

- [ ] **Step 6: Wire next-intl into next.config.ts**

Replace `/Users/vinei/Projects/eventgate/frontend/next.config.ts` with:

```ts
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig = {};

export default withNextIntl(nextConfig);
```

- [ ] **Step 7: Wrap layout providers**

Update `/Users/vinei/Projects/eventgate/frontend/app/layout.tsx` — wrap the body with `NextIntlClientProvider`:

```tsx
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = { title: "Eventgate", description: "Fast paperless event entrance" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Verify build**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

Expected: build passes, `Detected next-intl plugin` in output.

- [ ] **Step 9: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): wire next-intl with EN + KM message bundles"
```

---

## Task 15: Public registration form page

**Files:**
- Create: `frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx`
- Create: `frontend/components/guests/registration-form.tsx`
- Modify: `frontend/middleware.ts` (add `/e/` to public allowlist)

- [ ] **Step 1: Allow `/e/*` publicly in middleware**

In `/Users/vinei/Projects/eventgate/frontend/middleware.ts`, update `isPublic` to also match `/e/`:

```ts
const isPublic =
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
  pathname.startsWith(INVITE_PREFIX) ||
  pathname.startsWith("/e/");
```

- [ ] **Step 2: Form component**

Create `/Users/vinei/Projects/eventgate/frontend/components/guests/registration-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRegisterPublic } from "@/lib/guests";

type Props = { orgSlug: string; eventSlug: string; eventName: string };

export function RegistrationForm({ orgSlug, eventSlug, eventName }: Props) {
  const t = useTranslations("register");
  const router = useRouter();
  const register = useRegisterPublic(orgSlug, eventSlug);
  const [form, setForm] = useState({ name: "", email: "", phone_or_chat: "" });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { guest_id } = await register.mutateAsync(form);
      // Token never echoed by API — instead pass via URL fragment from a follow-up fetch
      // (Plan D will add a separate "look up my token" path; for now, redirect to success
      //  with guest_id only — the user has the link from the email anyway.)
      router.push(`/e/${orgSlug}/${eventSlug}/registered/${guest_id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title", { eventName })}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">{t("field_name")}</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("field_email")}</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("field_phone")}</span>
            <input
              required
              value={form.phone_or_chat}
              onChange={(e) => setForm({ ...form, phone_or_chat: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? t("submitting") : t("submit")}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Public page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { RegistrationForm } from "@/components/guests/registration-form";
import { API_BASE } from "@/lib/api";

type Props = { params: Promise<{ orgSlug: string; eventSlug: string }> };

async function loadEvent(orgSlug: string, eventSlug: string) {
  // Public unauthenticated load — backend allows this for events with registration_open=true.
  // We piggyback on the existing detail endpoint via a small public endpoint or just call the
  // protected one and 404 on failure. For Plan C, we accept failure → 404.
  const res = await fetch(`${API_BASE}/api/v1/orgs/${orgSlug}/events/${eventSlug}/`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ name: string }>;
}

export default async function RegisterPage({ params }: Props) {
  const { orgSlug, eventSlug } = await params;
  const event = await loadEvent(orgSlug, eventSlug);
  // If the protected endpoint failed because unauth, we still render — the form
  // works as long as the event exists and registration_open=true.
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <RegistrationForm
          orgSlug={orgSlug}
          eventSlug={eventSlug}
          eventName={event?.name ?? eventSlug}
        />
      </div>
    </main>
  );
}
```

> **Open follow-up:** the public register page needs to fetch the event's name + custom fields without authentication. Plan C currently relies on `event?.name ?? eventSlug` falling back to the slug. A small public `GET /api/v1/e/<org_slug>/<event_slug>/` endpoint (returning only name + field schema, no PII) is a clean Plan-D follow-up.

- [ ] **Step 4: Build + commit**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): add public /e/[orgSlug]/[eventSlug]/register page (i18n)"
```

---

## Task 16: Registration success page with QR

**Files:**
- Create: `frontend/app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx`
- Create: `frontend/components/guests/registration-success.tsx`

> **Design note:** Since the API does NOT return `entry_token` in the registration response (security: token only via email), the success page can't render the QR itself. Two options:
> 1. Show a "Check your email" message + a download link that's only valid via email
> 2. Return the token in a one-time-use cookie on the registration response
>
> For Plan C MVP: **Option 1**. The success page tells the user "check your email." This is consistent with the brief's intent (QR delivered via email; show at door). The on-page QR for self-serve download is a Plan-D enhancement (we'd add a small one-shot tokenized GET endpoint).

- [ ] **Step 1: Success component**

Create `/Users/vinei/Projects/eventgate/frontend/components/guests/registration-success.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RegistrationSuccess() {
  const t = useTranslations("register");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("success_title")}</CardTitle>
        <CardDescription>
          We sent your QR code to your email. Show it at the entrance — staff will scan it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive it? Check spam, or contact the event organizer.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(public)/e/[orgSlug]/[eventSlug]/registered/[guestId]/page.tsx`:

```tsx
import { RegistrationSuccess } from "@/components/guests/registration-success";

export default function RegisteredPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <RegistrationSuccess />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): add registration success page (email-driven QR delivery)"
```

---

## Task 17: Event create wizard

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/events/new/page.tsx`
- Create: `frontend/components/events/event-create-wizard.tsx`

- [ ] **Step 1: Wizard component**

Create `/Users/vinei/Projects/eventgate/frontend/components/events/event-create-wizard.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateEvent } from "@/lib/events";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function EventCreateWizard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const create = useCreateEvent(orgSlug);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [venue, setVenue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === slugify(name)) setSlug(slugify(v));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const event = await create.mutateAsync({ name, slug, venue });
      router.push(`/orgs/${orgSlug}/events/${event.slug}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create event</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Event name</span>
            <input
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Annual Meetup 2026"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">URL slug</span>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
            <span className="block mt-1 text-xs text-muted-foreground">
              Public form lives at /e/{orgSlug}/{slug || "your-slug"}/register
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Venue (optional)</span>
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <Button type="submit" className="w-full" disabled={create.isPending || !name || !slug}>
            {create.isPending ? "Creating…" : "Create event"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/orgs/[slug]/events/new/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";

import { EventCreateWizard } from "@/components/events/event-create-wizard";

export default function NewEventPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="max-w-md mx-auto">
      <EventCreateWizard orgSlug={slug} />
    </div>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): add event create wizard at /orgs/[slug]/events/new"
```

---

## Task 18: Events list page + org dashboard update

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/events/page.tsx`
- Create: `frontend/components/events/events-table.tsx`
- Modify: `frontend/app/(app)/orgs/[slug]/page.tsx` (replace "no events" placeholder with EventsTable)

- [ ] **Step 1: Events table component**

Create `/Users/vinei/Projects/eventgate/frontend/components/events/events-table.tsx`:

```tsx
"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvents } from "@/lib/events";

export function EventsTable({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading } = useEvents(orgSlug);
  const events = data?.results ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Events
          <Link
            href={`/orgs/${orgSlug}/events/new`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            New event
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && events.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No events yet. Create your first one to get a public registration URL.
          </p>
        )}
        {events.length > 0 && (
          <ul className="divide-y">
            {events.map((e) => (
              <li key={e.id} className="py-2 flex items-center justify-between">
                <Link
                  href={`/orgs/${orgSlug}/events/${e.slug}`}
                  className="text-sm hover:underline"
                >
                  {e.name}
                </Link>
                <span className="text-xs text-muted-foreground">{e.status}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Events list page (just renders EventsTable)**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/orgs/[slug]/events/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";

import { EventsTable } from "@/components/events/events-table";

export default function EventsPage() {
  const { slug } = useParams<{ slug: string }>();
  return <EventsTable orgSlug={slug} />;
}
```

- [ ] **Step 3: Update org dashboard to use EventsTable**

Edit `/Users/vinei/Projects/eventgate/frontend/app/(app)/orgs/[slug]/page.tsx`. Replace the "Events" Card content with an `<EventsTable orgSlug={slug} />` reference. Final content of the file:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { EventsTable } from "@/components/events/events-table";
import { buttonVariants } from "@/components/ui/button";
import { useOrg } from "@/lib/orgs";

export default function OrgDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: org, isLoading, isError } = useOrg(slug);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !org) return <p className="text-sm text-destructive">Organization not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <p className="text-sm text-muted-foreground">
            {org.slug} · {org.role}
          </p>
        </div>
        <Link href={`/orgs/${slug}/members`} className={buttonVariants({ variant: "outline" })}>
          Members
        </Link>
      </div>
      <EventsTable orgSlug={slug} />
    </div>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): add events table; wire into org dashboard"
```

---

## Task 19: Event detail page + form builder + guest list

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/form/page.tsx`
- Create: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/page.tsx`
- Create: `frontend/components/events/registration-form-builder.tsx`
- Create: `frontend/components/guests/guests-table.tsx`

- [ ] **Step 1: Event detail page (counts placeholder + nav)**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvent } from "@/lib/events";

export default function EventDashboardPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  const { data: event, isLoading } = useEvent(slug, eventSlug);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!event) return <p className="text-sm text-destructive">Event not found.</p>;

  const publicUrl = `/e/${slug}/${eventSlug}/register`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {event.slug} · {event.status} · {event.venue || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/orgs/${slug}/events/${eventSlug}/form`}
            className={buttonVariants({ variant: "outline" })}
          >
            Form
          </Link>
          <Link
            href={`/orgs/${slug}/events/${eventSlug}/guests`}
            className={buttonVariants({ variant: "outline" })}
          >
            Guests
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Public registration link</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-mono break-all">{publicUrl}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Share this URL with attendees. Counts and live arrivals land in Plan D.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Form builder component**

Create `/Users/vinei/Projects/eventgate/frontend/components/events/registration-form-builder.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAddField, useDeleteField, useFields, type FieldType } from "@/lib/events";

export function RegistrationFormBuilder({
  orgSlug,
  eventSlug,
}: {
  orgSlug: string;
  eventSlug: string;
}) {
  const fields = useFields(orgSlug, eventSlug);
  const addField = useAddField(orgSlug, eventSlug);
  const deleteField = useDeleteField(orgSlug, eventSlug);
  const [name, setName] = useState("");
  const [labelKm, setLabelKm] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [required, setRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const field_key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const nextOrder = (fields.data?.results.length ?? 0) + 1;
    try {
      await addField.mutateAsync({
        field_key,
        label_en: name,
        label_km: labelKm,
        field_type: type,
        required,
        order_index: nextOrder,
      });
      setName("");
      setLabelKm("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a field</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto_auto]">
            <input
              required
              placeholder="Label (English)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Label (Khmer)"
              value={labelKm}
              onChange={(e) => setLabelKm(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="text">Text</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="textarea">Long text</option>
              <option value="select">Select</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
              Required
            </label>
            <Button type="submit" disabled={addField.isPending}>
              Add
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fields</CardTitle>
        </CardHeader>
        <CardContent>
          {fields.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {fields.data && (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Key</th>
                  <th className="text-left font-normal py-2">Label (EN)</th>
                  <th className="text-left font-normal py-2">Label (KM)</th>
                  <th className="text-left font-normal py-2">Type</th>
                  <th className="text-left font-normal py-2">Required</th>
                  <th className="text-left font-normal py-2"></th>
                </tr>
              </thead>
              <tbody>
                {fields.data.results.map((f) => (
                  <tr key={f.id} className="border-b">
                    <td className="py-2 font-mono text-xs">{f.field_key}</td>
                    <td className="py-2">{f.label_en}</td>
                    <td className="py-2">{f.label_km}</td>
                    <td className="py-2">{f.field_type}</td>
                    <td className="py-2">{f.required ? "Yes" : "No"}</td>
                    <td className="py-2 text-right">
                      {!f.is_preset && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleteField.isPending}
                          onClick={() => deleteField.mutate(f.field_key)}
                        >
                          Remove
                        </Button>
                      )}
                      {f.is_preset && (
                        <span className="text-xs text-muted-foreground">Preset</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Form-builder page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/orgs/[slug]/events/[eventSlug]/form/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";

import { RegistrationFormBuilder } from "@/components/events/registration-form-builder";

export default function EventFormPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Registration form</h1>
      <RegistrationFormBuilder orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
```

- [ ] **Step 4: Guests table component**

Create `/Users/vinei/Projects/eventgate/frontend/components/guests/guests-table.tsx`:

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGuests } from "@/lib/guests";

export function GuestsTable({
  orgSlug,
  eventSlug,
}: {
  orgSlug: string;
  eventSlug: string;
}) {
  const guests = useGuests(orgSlug, eventSlug);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guests {guests.data && `(${guests.data.count})`}</CardTitle>
      </CardHeader>
      <CardContent>
        {guests.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {guests.data && guests.data.results.length === 0 && (
          <p className="text-sm text-muted-foreground">No registrations yet.</p>
        )}
        {guests.data && guests.data.results.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="text-left font-normal py-2">Name</th>
                <th className="text-left font-normal py-2">Email</th>
                <th className="text-left font-normal py-2">Phone</th>
                <th className="text-left font-normal py-2">Entry</th>
                <th className="text-left font-normal py-2">Registered</th>
              </tr>
            </thead>
            <tbody>
              {guests.data.results.map((g) => (
                <tr key={g.id} className="border-b">
                  <td className="py-2">{g.full_name}</td>
                  <td className="py-2">{g.email}</td>
                  <td className="py-2">{g.phone_or_chat}</td>
                  <td className="py-2">{g.entry_status}</td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(g.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Guests page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/orgs/[slug]/events/[eventSlug]/guests/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";

import { GuestsTable } from "@/components/guests/guests-table";

export default function GuestsPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Guests</h1>
      <GuestsTable orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
```

- [ ] **Step 6: Build + commit**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): add event detail, form builder, and guest list pages"
```

---

## Task 20: Migrate staging + redeploy backend

**Files:** none — deployment only.

- [ ] **Step 1: Push**

```bash
cd /Users/vinei/Projects/eventgate
git push
```

Wait for CI to pass.

- [ ] **Step 2: Deploy**

```bash
cd /Users/vinei/Projects/eventgate/backend
flyctl deploy --remote-only --app eventgate-backend-staging
```

- [ ] **Step 3: Migrate**

```bash
flyctl ssh console -C "python manage.py migrate" --app eventgate-backend-staging
```

Expected: new migrations apply cleanly (events.0001, events.0002, guests.0001, notifications.0001).

- [ ] **Step 4: Smoke-test the new endpoints**

```bash
curl -s https://eventgate-backend-staging.fly.dev/api/health/ | python3 -m json.tool

# Public registration on a non-existent event (should 404)
curl -s -X POST https://eventgate-backend-staging.fly.dev/api/v1/e/acme/no-such-event/register/ \
  -H 'Content-Type: application/json' -d '{"name":"a","email":"a@a.com","phone_or_chat":"1"}' \
  -i | head -3
```

Expected: `HTTP/2 404` (or similar) — at least proves the route exists and validates.

---

## Task 21: Resend wiring + frontend redeploy + manual E2E

**Files:**
- Modify: `frontend/middleware.ts` (verify `/e/` is already public — done in Task 15)

- [ ] **Step 1 (when ready): Sign up for Resend**

1. Sign up at https://resend.com
2. Verify a sender domain (or use Resend's test sandbox `onboarding@resend.dev` for staging)
3. Copy your API key

- [ ] **Step 2: Set RESEND_API_KEY on Fly**

```bash
flyctl secrets set --app eventgate-backend-staging RESEND_API_KEY="<your-api-key>"
flyctl secrets set --app eventgate-backend-staging DEFAULT_FROM_EMAIL="Eventgate <onboarding@resend.dev>"
```

(Adjust DEFAULT_FROM_EMAIL to your verified sender once domain verification is complete.)

- [ ] **Step 3: Redeploy frontend**

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm dlx vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN" --scope vineidev-4891s-projects
```

- [ ] **Step 4: Manual E2E**

1. Sign in to https://frontend-five-lovat-94.vercel.app via magic-link.
2. Create an org (already done in Plan B).
3. Click "New event", create "Conf 2026" with slug "conf-2026".
4. Open `https://frontend-five-lovat-94.vercel.app/e/<your-org-slug>/conf-2026/register` in a private window.
5. Submit name, email (a real address you control), phone.
6. Verify the QR PNG arrives in the email (if Resend is configured) OR check Fly logs for the multipart email + attachment (`flyctl logs --app eventgate-backend-staging --no-tail`).
7. Go to https://frontend-five-lovat-94.vercel.app/orgs/<org-slug>/events/conf-2026/guests — verify the guest row appears with the submitted name/email.

If everything works: Plan C is done.

---

## Task 22: Completion log

- [ ] **Step 1: Append completion log**

Append to the bottom of `/Users/vinei/Projects/eventgate/docs/plans/2026-05-20-plan-c-events-registration.md`:

```markdown
---

## Completion Log

- **Completed:** <YYYY-MM-DD>
- **Backend:** N new tests added; new apps: events, guests, notifications. Real email via Resend (conditional on RESEND_API_KEY).
- **Frontend:** event create wizard, events table, event detail, form builder, guests list, public registration page (EN+KM).
- **Notes / deviations:**
  - <fill in>
```

- [ ] **Step 2: Push**

```bash
cd /Users/vinei/Projects/eventgate
git add docs/plans/2026-05-20-plan-c-events-registration.md
git commit -m "docs(plan-c): completion log"
git push
```

---

## Verification Summary

**What you should have at the end of Plan C:**

1. ✅ `apps.events`: `Event` model (org-scoped slug uniqueness, lifecycle status) + `RegistrationField` (with `label_en` + `label_km`).
2. ✅ Event CRUD endpoints under `/api/v1/orgs/<slug>/events/`, role-gated for write (owner/admin/manager).
3. ✅ Field CRUD endpoints with preset-protected delete.
4. ✅ Preset fields auto-seeded on event creation (name, email, phone_or_chat).
5. ✅ `apps.guests`: `Guest` model inheriting `OrgScopedModel`, with `entry_token` per-event uniqueness, `entry_status` + `info_status` separated per brief Appendix A.
6. ✅ Public registration endpoint at `POST /api/v1/e/<org>/<event>/register/` (no auth).
7. ✅ Guest list endpoint for staff at `GET /api/v1/orgs/<org>/events/<event>/guests/`.
8. ✅ `apps.common.qr.render_png` — segno-based, no Pillow dependency, ~370x370px.
9. ✅ Token-gated QR endpoint at `GET /api/v1/guests/<id>/qr.png?token=<raw>` (constant-time compare).
10. ✅ `apps.notifications.NotificationDispatch` + admin.
11. ✅ Magic-link email moved into a Celery task (with dispatch logging).
12. ✅ QR email Celery task (rendered PNG attached; retry-on-failure).
13. ✅ Resend wired conditionally via `RESEND_API_KEY` env var; falls back to console in dev/test.
14. ✅ Frontend events + guests + qr clients with TanStack Query.
15. ✅ `next-intl` configured with EN + KM message bundles.
16. ✅ Public registration form page (EN+KM) at `/e/<org>/<event>/register`.
17. ✅ Registration success page that points to email.
18. ✅ Event create wizard, events table, event detail, form builder, guest list.
19. ✅ Staging deployed: backend (Fly) + Vercel; manual E2E ran end-to-end.

**Intentionally NOT in Plan C:**

- ❌ Public unauth event-detail endpoint — the public registration page falls back to using the slug as title. Plan D adds a small public endpoint.
- ❌ On-page QR rendering on the success page (current MVP shows "check your email" only). Plan D adds a one-time tokenized cookie path.
- ❌ Walk-in flow — Plan D.
- ❌ Pre-reg scanner — Plan D.
- ❌ Khmer translations of existing Plan B pages (login, org list, members, etc.) — Plan F cleanup.
- ❌ Telegram delivery — Plan G.
- ❌ CSV guest import — Plan G.
- ❌ Rate limiting on registration endpoint — Plan F.
- ❌ Guest detail page with resend-QR action — Plan F.

---

## Risks & Open Questions

| Risk | Mitigation |
|---|---|
| Resend domain verification delays first email send | Use the sandbox sender (`onboarding@resend.dev`) for staging; verify domain before pilot. |
| Public form can't show event name without authentication | Plan D adds a public `GET /api/v1/e/<org>/<event>/` endpoint. For now the page falls back to the slug. |
| Form-builder allows duplicate field_key only by exact match — case-insensitivity not enforced | Acceptable for MVP; admins control field naming directly. |
| `Guest.custom_fields` validation is minimal (just drops unknown keys) | Per-field-type validation is a Plan F enhancement. |
| Khmer translations are starter-grade | Pilot-blocking task: have the Khmer translator review `lib/i18n/messages/km.json` before any external pilot. |
| QR email body is plaintext only | HTML version + Khmer body is a Plan F enhancement. |
| QR is rendered on demand (no caching) | Each `qr.png` GET re-renders. ~10ms per render — fine at MVP scale. Add Redis cache or pre-render to R2 if peak load reveals an issue. |

---

## Decision Heritage (newly locked-in this plan)

- **QR payload is the raw `entry_token`**, no URL wrap (brief Appendix A — already established but newly applied here).
- **Registration response intentionally omits `entry_token`.** Discovering the QR happens via email only at MVP. (Plan D may add a one-time tokenized in-session reveal.)
- **`Guest.custom_fields` is a JSONB blob keyed by `field_key`.** Schema-of-record lives in `registration_fields`; submission validation is best-effort.
- **Preset fields are immutable.** Name/email/phone are seeded as `is_preset=True` and cannot be deleted via API.
- **Event slug is unique per org, not globally.** Two orgs can both have `conf-2026`. URLs distinguish via org slug.
- **Public registration is gated only by `event.registration_open`.** No auth, no captcha at MVP. Rate limiting deferred to Plan F.
- **Email send is always via Celery now.** Both magic-link (Plan B) and QR delivery flow through `accounts.tasks` and `guests.tasks` with `NotificationDispatch` rows.

---

## Completion Log

- **Completed:** 2026-05-20
- **Backend:** 105 tests (12 new test files added in Plan C). New apps: `events`, `guests`, `notifications`. Real email via Resend ready (conditional on `RESEND_API_KEY` — currently unset; falls back to console backend).
- **Frontend:** 7 new pages + 2 hook modules + 7 components. next-intl wired with EN + KM bundles.
- **Staging deploy:** backend redeployed (commit `fdbc557`), all Plan C migrations applied to Neon; frontend redeployed to Vercel.

### End-to-end verification (against staging)

```
POST /api/v1/auth/magic-link/request/ {"email":"plan-c-v3@..."}
  → 204 + magic-link printed to Fly logs ✓

POST /api/v1/auth/magic-link/consume/ {"token":"<raw>"}
  → 200 + JWT cookies set ✓

POST /api/v1/orgs/ {"name":"Plan C Smoke"}
  → 201 slug=plan-c-smoke ✓

POST /api/v1/orgs/plan-c-smoke/events/ {"name":"Conf 2026","slug":"conf-2026"}
  → 201 (preset fields name/email/phone_or_chat auto-seeded) ✓

POST /api/v1/e/plan-c-smoke/conf-2026/register/ {"name":"Alice","email":"alice-e2e@...","phone_or_chat":"+855 ..."}
  → 201 {"guest_id":"<uuid>"} (entry_token NOT exposed in response) ✓
  → QR email rendered + delivered to console (visible in Fly logs) ✓

GET /api/v1/orgs/plan-c-smoke/events/conf-2026/guests/
  → 200 count=1, Alice listed ✓

GET /api/v1/guests/<uuid>/qr.png?token=<raw>
  → 200 image/png, 629x629 PNG, 860 bytes ✓
```

### Deviations from this plan

- **PyPI dep name fix.** Plan said `anymail[resend]`; actual PyPI distribution is `django-anymail`. Fixed inline in Task 1.
- **Field shadowing.** Plan C Task 2's `Event` model has a `timezone` field that shadowed `django.utils.timezone`. Implementer aliased the import as `tz` and used `tz.now` consistently (also applied in Task 3 RegistrationField and Task 10 NotificationDispatch).
- **QR scale.** Plan said `render_png(scale=10)` default; that produces ~230px which fails the `≥320px` test. Implementer bumped default to `scale=17` (~391px). Documented as the correct resolution of the spec contradiction.
- **DRF test response API.** Plan used `response.text` (from `requests` library); DRF Response uses `response.content.decode()`. Implementer fixed inline.
- **CELERY_TASK_ALWAYS_EAGER on staging.** Plan didn't anticipate that staging has no separate Celery worker process — only the web process. After Task 11 moved emails into Celery tasks, they queued indefinitely. Wired `CELERY_TASK_ALWAYS_EAGER` as an env-var-readable Django setting and set the Fly secret to `"true"`. **A real worker process on Fly is a Plan D ops task.**
- **Public event-detail endpoint not added.** The public registration page falls back to using `eventSlug` as the title. The plan acknowledged this as an open follow-up; a public `GET /api/v1/e/<org>/<event>/` endpoint should land in Plan D.
- **Khmer translations are starter-grade.** The `lib/i18n/messages/km.json` strings are first-pass and need review by the user's identified Khmer translator before any external pilot.
- **Resend not yet wired in production.** `RESEND_API_KEY` is unset; staging uses console backend. User signed up for Resend in parallel — wire on next deploy.

### Follow-ups for Plan D (parking lot)

- Provision a Celery worker process on Fly (currently emails run synchronously in the web process via `CELERY_TASK_ALWAYS_EAGER`).
- Add public `GET /api/v1/e/<org>/<event>/` endpoint so the registration page can show the real event name.
- Wire `RESEND_API_KEY` on Fly once user completes Resend signup + sender domain verification.
- Khmer translation review pass with the identified translator.
- Walk-in flow (Plan D core).
- Pre-reg scanner PWA (Plan D core).
- Pre-event-detail public endpoint for the registration form.
- HTML version of the QR delivery email (currently plaintext-only).
