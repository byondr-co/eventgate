# Plan N - Pilot Reliability + Google Form Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Apps Script based Google Form submission bridge for the Click Cam pilot while preserving the June 12 T-7 pilot reliability gate.

**Architecture:** Build a small `apps.integrations` Django app with event-scoped bridge config, hashed shared secret, idempotent submission processing, audit rows, and a JSON webhook that reuses `register_guest()`. Add a minimal event settings panel that exposes the webhook URL, one-time secret, field mapping, and a copyable Sheet-bound Apps Script. Update the pilot runbook and add a Plan N verification checklist so the bridge can be enabled only if it passes rehearsal.

**Tech Stack:** Django 5 + DRF + Postgres + Celery, Next.js 16 + React 19 + TanStack Query + Tailwind v4, Vitest + Testing Library, pytest, Google Apps Script `UrlFetchApp`.

---

## Current State

- `origin/main` includes Phase 5c UI adoption through `4c80dca`.
- Local `main` includes design-spec commit `688a9af`.
- Existing untracked files `AGENTS.md` and `dummy-guests-250.csv` are unrelated and must remain untouched.
- Existing guest creation path is `backend/apps/guests/services.py::register_guest()`. The Google bridge must use that path for new guests so QR email dispatch remains automatic.
- Existing CSV import and Telegram code already show the patterns for multipart handling, audit writes, and notification delivery.

## Pre-flight

Run once before executing implementation tasks:

```bash
cd /Users/vinei/Projects/eventgate
git status --short --branch
git log --oneline --decorate --max-count=5
```

Expected:

- Branch is `main`, ahead of `origin/main` only by the design-spec/plan commits or on a fresh feature branch created for implementation.
- Untracked `AGENTS.md` and `dummy-guests-250.csv` may still appear; do not stage them.

Backend commands:

```bash
docker start eventgate-postgres-1 || docker compose up -d postgres
cd backend
uv run pytest -q
uv run mypy apps config
```

Frontend commands:

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend
pnpm install
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
```

## File Structure

Backend files:

- Create `backend/apps/integrations/__init__.py` - app package marker.
- Create `backend/apps/integrations/apps.py` - Django app config.
- Create `backend/apps/integrations/models.py` - `GoogleFormBridge` and `GoogleFormSubmission`.
- Create `backend/apps/integrations/serializers.py` - admin API serializers and mapping validation.
- Create `backend/apps/integrations/services.py` - field mapping, idempotent submission processing, duplicate update behavior, and audit writes.
- Create `backend/apps/integrations/urls.py` - admin and webhook routes.
- Create `backend/apps/integrations/views.py` - role-gated bridge management views and anonymous secret-protected webhook.
- Modify `backend/config/settings/base.py` - add `apps.integrations`.
- Modify `backend/config/urls.py` - include integration URLs.
- Tests:
  - Create `backend/tests/test_google_form_bridge_models.py`.
  - Create `backend/tests/test_google_form_bridge_admin_api.py`.
  - Create `backend/tests/test_google_form_bridge_webhook.py`.

Frontend files:

- Create `frontend/lib/google-form-bridge.ts` - TanStack Query hooks and types.
- Create `frontend/components/integrations/google-form-bridge-card.tsx` - settings card.
- Create `frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx`.
- Modify `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/settings/page.tsx` - mount card below existing PIN/walk-in settings.

Docs:

- Create `docs/runbooks/google-form-bridge-apps-script.md` - install guide and full Apps Script.
- Create `docs/plans/2026-06-07-plan-n-verification-checklist.md` - verification checklist.
- Modify `docs/plans/2026-05-23-pilot-launch-runbook.md` - add bridge gates, install, fallback, and post-pilot feedback hooks.

## Task 1: Backend app + bridge models

**Files:**

- Create: `backend/apps/integrations/__init__.py`
- Create: `backend/apps/integrations/apps.py`
- Create: `backend/apps/integrations/models.py`
- Modify: `backend/config/settings/base.py`
- Test: `backend/tests/test_google_form_bridge_models.py`

- [ ] **Step 1: Write the failing model tests**

Create `backend/tests/test_google_form_bridge_models.py`:

```python
import pytest

from apps.accounts.models import User
from apps.common.tokens import tokens_match
from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.integrations.models import GoogleFormBridge, GoogleFormSubmission
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="admin@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="admin")
    event = Event.objects.create(
        organization=org,
        name="Launch",
        slug="launch",
        registration_open=True,
    )
    seed_preset_fields(event)
    return org, user, event


@pytest.mark.django_db
def test_create_with_secret_hashes_secret_and_derives_organization(setup):
    org, user, event = setup

    bridge, raw_secret = GoogleFormBridge.create_with_secret(
        event=event,
        created_by=user,
        name="Click Cam Google Form",
        field_mapping={"Full Name": "name", "Email": "email"},
    )

    assert bridge.organization == org
    assert bridge.event == event
    assert bridge.created_by == user
    assert bridge.enabled is False
    assert bridge.secret_hash != raw_secret
    assert tokens_match(raw_secret, bridge.secret_hash)
    assert bridge.check_secret(raw_secret) is True
    assert bridge.check_secret("wrong") is False


@pytest.mark.django_db
def test_rotate_secret_replaces_hash_and_returns_new_raw_secret(setup):
    org, user, event = setup
    bridge, old_secret = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    new_secret = bridge.rotate_secret()
    bridge.refresh_from_db()

    assert new_secret != old_secret
    assert bridge.check_secret(old_secret) is False
    assert bridge.check_secret(new_secret) is True


@pytest.mark.django_db
def test_submission_id_is_unique_per_bridge(setup):
    org, user, event = setup
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)
    GoogleFormSubmission.objects.create(
        bridge=bridge,
        event=event,
        submission_id="row-2",
        status="accepted",
        payload_hash="abc",
        received_payload={"fields": {"Email": "a@example.com"}},
    )

    with pytest.raises(Exception):
        GoogleFormSubmission.objects.create(
            bridge=bridge,
            event=event,
            submission_id="row-2",
            status="accepted",
            payload_hash="def",
            received_payload={"fields": {"Email": "b@example.com"}},
        )


@pytest.mark.django_db
def test_submission_save_derives_org_and_event_from_bridge(setup):
    org, user, event = setup
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    sub = GoogleFormSubmission.objects.create(
        bridge=bridge,
        submission_id="row-3",
        status="rejected",
        payload_hash="abc",
        received_payload={"fields": {}},
        error="Missing required: email",
    )

    assert sub.organization == org
    assert sub.event == event
```

- [ ] **Step 2: Run model tests to verify they fail**

Run:

```bash
cd backend
uv run pytest tests/test_google_form_bridge_models.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'apps.integrations'`.

- [ ] **Step 3: Create the integrations app files**

Create `backend/apps/integrations/__init__.py` as an empty file.

Create `backend/apps/integrations/apps.py`:

```python
from django.apps import AppConfig


class IntegrationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.integrations"
```

Create `backend/apps/integrations/models.py`:

```python
from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone

from apps.common.models import OrgScopedModel
from apps.common.tokens import generate_token, hash_token, tokens_match


class GoogleFormBridge(OrgScopedModel):
    """Event-scoped Apps Script bridge for Google Form or Sheet submissions."""

    DUPLICATE_POLICIES = (
        ("upsert_by_email", "Upsert by email"),
        ("reject_duplicates", "Reject duplicates"),
    )

    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="google_form_bridges",
    )
    name = models.CharField(max_length=120, default="Google Form")
    enabled = models.BooleanField(default=False)
    secret_hash = models.CharField(max_length=64)
    field_mapping = models.JSONField(default=dict, blank=True)
    duplicate_policy = models.CharField(
        max_length=32,
        choices=DUPLICATE_POLICIES,
        default="upsert_by_email",
    )
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="google_form_bridges",
    )
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes: ClassVar = [
            models.Index(fields=("event", "enabled")),
        ]

    def save(self, *args, **kwargs):
        if not self.organization_id and self.event_id:
            self.organization = self.event.organization
        super().save(*args, **kwargs)

    @classmethod
    def create_with_secret(
        cls,
        *,
        event,
        created_by,
        name: str = "Google Form",
        field_mapping: dict[str, str] | None = None,
        duplicate_policy: str = "upsert_by_email",
    ) -> tuple[GoogleFormBridge, str]:
        raw_secret = generate_token()
        bridge = cls.objects.create(
            organization=event.organization,
            event=event,
            name=name,
            created_by=created_by,
            secret_hash=hash_token(raw_secret),
            field_mapping=field_mapping or {},
            duplicate_policy=duplicate_policy,
        )
        return bridge, raw_secret

    def rotate_secret(self) -> str:
        raw_secret = generate_token()
        self.secret_hash = hash_token(raw_secret)
        self.save(update_fields=["secret_hash", "updated_at"])
        return raw_secret

    def check_secret(self, raw_secret: str) -> bool:
        return tokens_match(raw_secret, self.secret_hash)

    def mark_seen(self) -> None:
        self.last_seen_at = timezone.now()
        self.save(update_fields=["last_seen_at", "updated_at"])

    def __str__(self) -> str:
        return f"{self.name} -> {self.event.slug}"


class GoogleFormSubmission(OrgScopedModel):
    """Idempotency and audit record for one Google Form bridge submission."""

    STATUSES = (
        ("accepted", "Accepted"),
        ("duplicate", "Duplicate"),
        ("updated", "Updated"),
        ("rejected", "Rejected"),
    )

    bridge = models.ForeignKey(
        GoogleFormBridge,
        on_delete=models.CASCADE,
        related_name="submissions",
    )
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="google_form_submissions",
    )
    submission_id = models.CharField(max_length=160)
    guest = models.ForeignKey(
        "guests.Guest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="google_form_submissions",
    )
    status = models.CharField(max_length=16, choices=STATUSES)
    payload_hash = models.CharField(max_length=64)
    received_payload = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("bridge", "submission_id"),
                name="unique_google_form_submission_per_bridge",
            )
        ]
        indexes: ClassVar = [
            models.Index(fields=("bridge", "status")),
            models.Index(fields=("event", "created_at")),
        ]
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if self.bridge_id:
            if not self.event_id:
                self.event = self.bridge.event
            if not self.organization_id:
                self.organization = self.bridge.organization
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.bridge_id}:{self.submission_id}:{self.status}"
```

- [ ] **Step 4: Register the app**

In `backend/config/settings/base.py`, add `"apps.integrations",` after `"apps.notifications",`:

```python
    "apps.notifications",
    "apps.integrations",
    "apps.events",
```

- [ ] **Step 5: Generate the migration**

Run:

```bash
cd backend
uv run python manage.py makemigrations integrations
```

Expected: creates `backend/apps/integrations/migrations/0001_initial.py`.

- [ ] **Step 6: Run model tests**

Run:

```bash
cd backend
uv run pytest tests/test_google_form_bridge_models.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/integrations backend/config/settings/base.py backend/tests/test_google_form_bridge_models.py
git commit -m "feat(integrations): google form bridge models"
```

## Task 2: Backend service for mapping, idempotency, duplicates, and audit

**Files:**

- Create: `backend/apps/integrations/services.py`
- Test: `backend/tests/test_google_form_bridge_webhook.py`

- [ ] **Step 1: Write failing service-level tests**

Create `backend/tests/test_google_form_bridge_webhook.py`:

```python
from unittest.mock import patch

import pytest

from apps.audit.models import AuditEvent
from apps.accounts.models import User
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.guests.models import Guest
from apps.integrations.models import GoogleFormBridge, GoogleFormSubmission
from apps.integrations.services import process_google_form_submission
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="admin@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="admin")
    event = Event.objects.create(
        organization=org,
        name="Launch",
        slug="launch",
        registration_open=True,
    )
    seed_preset_fields(event)
    RegistrationField.objects.create(
        event=event,
        field_key="company",
        label_en="Company",
        required=False,
        order_index=99,
    )
    bridge, raw_secret = GoogleFormBridge.create_with_secret(
        event=event,
        created_by=user,
        field_mapping={
            "Full Name": "name",
            "Email": "email",
            "Phone": "phone_or_chat",
            "Company": "company",
        },
    )
    bridge.enabled = True
    bridge.save(update_fields=["enabled"])
    return org, user, event, bridge, raw_secret


def _payload(submission_id="row-2", email="alice@example.com", name="Alice"):
    return {
        "submission_id": submission_id,
        "submitted_at": "2026-06-07T10:15:00+07:00",
        "fields": {
            "Full Name": name,
            "Email": email,
            "Phone": "+85512345678",
            "Company": "The Click Cam",
        },
    }


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_process_submission_creates_guest_sends_qr_and_audits(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup

    result = process_google_form_submission(bridge=bridge, payload=_payload())

    guest = Guest.objects.get(event=event, email="alice@example.com")
    assert result["status"] == "accepted"
    assert result["guest_id"] == str(guest.id)
    assert guest.full_name == "Alice"
    assert guest.phone_or_chat == "+85512345678"
    assert guest.custom_fields == {"company": "The Click Cam"}
    assert guest.source == "google_form_bridge"
    mock_delay.assert_called_once_with(guest_id=str(guest.id))
    assert GoogleFormSubmission.objects.get(bridge=bridge).guest == guest
    assert AuditEvent.objects.filter(action="integration.google_form_guest_created").count() == 1


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_process_submission_is_idempotent_by_submission_id(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup

    first = process_google_form_submission(bridge=bridge, payload=_payload())
    second = process_google_form_submission(bridge=bridge, payload=_payload())

    assert first["status"] == "accepted"
    assert second["status"] == "accepted"
    assert Guest.objects.filter(event=event, email="alice@example.com").count() == 1
    mock_delay.assert_called_once()
    assert GoogleFormSubmission.objects.filter(bridge=bridge, submission_id="row-2").count() == 1


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_duplicate_email_updates_missing_fields_without_resending_qr(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup
    existing = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="existing-token",
        entry_status="registered_not_arrived",
        info_status="info_completed",
        full_name="Alice Old",
        email="alice@example.com",
        phone_or_chat="",
        custom_fields={},
        source="public_form",
    )

    result = process_google_form_submission(
        bridge=bridge,
        payload=_payload(submission_id="row-3", email="alice@example.com", name="Alice New"),
    )
    existing.refresh_from_db()

    assert result["status"] == "updated"
    assert result["guest_id"] == str(existing.id)
    assert existing.full_name == "Alice New"
    assert existing.phone_or_chat == "+85512345678"
    assert existing.custom_fields == {"company": "The Click Cam"}
    mock_delay.assert_not_called()
    assert AuditEvent.objects.filter(action="integration.google_form_guest_updated").count() == 1


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_duplicate_email_with_no_changes_is_noop_duplicate(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup
    Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        entry_token="existing-token",
        entry_status="registered_not_arrived",
        info_status="info_completed",
        full_name="Alice",
        email="alice@example.com",
        phone_or_chat="+85512345678",
        custom_fields={"company": "The Click Cam"},
        source="public_form",
    )

    result = process_google_form_submission(bridge=bridge, payload=_payload(submission_id="row-4"))

    assert result["status"] == "duplicate"
    assert Guest.objects.filter(event=event, email="alice@example.com").count() == 1
    mock_delay.assert_not_called()
    assert AuditEvent.objects.filter(action="integration.google_form_guest_duplicate").count() == 1


@pytest.mark.django_db
def test_missing_required_field_is_rejected_and_audited(setup):
    org, user, event, bridge, raw_secret = setup
    payload = _payload(submission_id="row-5")
    payload["fields"]["Email"] = ""

    result = process_google_form_submission(bridge=bridge, payload=payload)

    assert result["status"] == "rejected"
    assert "Missing required" in result["detail"]
    assert Guest.objects.filter(event=event).count() == 0
    sub = GoogleFormSubmission.objects.get(bridge=bridge, submission_id="row-5")
    assert sub.status == "rejected"
    assert AuditEvent.objects.filter(action="integration.google_form_submission_rejected").count() == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
uv run pytest tests/test_google_form_bridge_webhook.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'apps.integrations.services'`.

- [ ] **Step 3: Implement the service**

Create `backend/apps/integrations/services.py`:

```python
from __future__ import annotations

import hashlib
import json
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.audit.services import write_audit
from apps.events.models import RegistrationField
from apps.guests.models import Guest
from apps.guests.services import EventNotOpen, RegistrationError, register_guest
from apps.integrations.models import GoogleFormBridge, GoogleFormSubmission

PRESET_TARGETS = {"name", "email", "phone_or_chat"}


class GoogleFormBridgeError(Exception):
    """Raised when a Google Form submission cannot be accepted."""


def payload_hash(payload: dict[str, Any]) -> str:
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def valid_field_keys(bridge: GoogleFormBridge) -> set[str]:
    event_keys = set(
        RegistrationField.objects.filter(event=bridge.event).values_list("field_key", flat=True)
    )
    return event_keys | PRESET_TARGETS


def map_google_fields(bridge: GoogleFormBridge, fields: dict[str, Any]) -> dict[str, str]:
    allowed = valid_field_keys(bridge)
    out: dict[str, str] = {}
    for label, target in (bridge.field_mapping or {}).items():
        if target not in allowed:
            raise GoogleFormBridgeError(f"Mapping target '{target}' is not valid for this event.")
        raw = fields.get(label, "")
        if isinstance(raw, list):
            value = " ".join(str(v).strip() for v in raw if str(v).strip())
        else:
            value = str(raw).strip()
        if value:
            out[target] = value
    return out


def _submission_time(raw: Any):
    if not raw:
        return None
    if not isinstance(raw, str):
        return None
    parsed = parse_datetime(raw)
    if parsed is None:
        return None
    return parsed


def _audit_rejection(
    *,
    bridge: GoogleFormBridge,
    submission_id: str,
    digest: str,
    reason: str,
    submission: GoogleFormSubmission | None = None,
) -> None:
    write_audit(
        organization=bridge.organization,
        event=bridge.event,
        guest=submission.guest if submission else None,
        actor_type="integration",
        actor_id=str(bridge.id),
        action="integration.google_form_submission_rejected",
        result="error",
        details={
            "bridge_id": str(bridge.id),
            "submission_id": submission_id,
            "payload_hash": digest,
            "reason": reason,
        },
    )


def _update_existing_guest(guest: Guest, payload: dict[str, str]) -> list[str]:
    changed: list[str] = []

    if payload.get("name") and guest.full_name != payload["name"]:
        guest.full_name = payload["name"]
        changed.append("full_name")
    if payload.get("phone_or_chat") and guest.phone_or_chat != payload["phone_or_chat"]:
        guest.phone_or_chat = payload["phone_or_chat"]
        changed.append("phone_or_chat")

    custom_updates = {
        key: value
        for key, value in payload.items()
        if key not in PRESET_TARGETS and value and guest.custom_fields.get(key) != value
    }
    if custom_updates:
        guest.custom_fields = {**(guest.custom_fields or {}), **custom_updates}
        changed.append("custom_fields")

    if changed:
        guest.save(update_fields=[*changed, "updated_at"])
    return changed


@transaction.atomic
def process_google_form_submission(
    *,
    bridge: GoogleFormBridge,
    payload: dict[str, Any],
) -> dict[str, Any]:
    submission_id = str(payload.get("submission_id") or "").strip()
    if not submission_id:
        raise GoogleFormBridgeError("submission_id is required.")

    fields = payload.get("fields")
    if not isinstance(fields, dict):
        raise GoogleFormBridgeError("fields must be an object.")

    digest = payload_hash(payload)
    submission, created = GoogleFormSubmission.objects.get_or_create(
        bridge=bridge,
        submission_id=submission_id,
        defaults={
            "organization": bridge.organization,
            "event": bridge.event,
            "status": "rejected",
            "payload_hash": digest,
            "received_payload": payload,
            "submitted_at": _submission_time(payload.get("submitted_at")),
        },
    )
    if not created and submission.processed_at:
        return {
            "status": submission.status,
            "guest_id": str(submission.guest_id) if submission.guest_id else None,
            "detail": submission.error,
        }

    try:
        if not bridge.enabled:
            raise GoogleFormBridgeError("Bridge is disabled.")
        mapped = map_google_fields(bridge, fields)
        existing = (
            Guest.objects.filter(event=bridge.event, email=mapped.get("email", "")).first()
            if mapped.get("email")
            else None
        )
        if existing:
            if bridge.duplicate_policy == "reject_duplicates":
                raise GoogleFormBridgeError("Duplicate: email already registered for this event")
            changed = _update_existing_guest(existing, mapped)
            status = "updated" if changed else "duplicate"
            action = (
                "integration.google_form_guest_updated"
                if changed
                else "integration.google_form_guest_duplicate"
            )
            submission.status = status
            submission.guest = existing
            submission.error = ""
            submission.payload_hash = digest
            submission.received_payload = payload
            submission.processed_at = timezone.now()
            submission.save(
                update_fields=[
                    "status",
                    "guest",
                    "error",
                    "payload_hash",
                    "received_payload",
                    "processed_at",
                    "updated_at",
                ]
            )
            write_audit(
                organization=bridge.organization,
                event=bridge.event,
                guest=existing,
                actor_type="integration",
                actor_id=str(bridge.id),
                action=action,
                result="success",
                entry_token=existing.entry_token,
                details={
                    "bridge_id": str(bridge.id),
                    "submission_id": submission_id,
                    "payload_hash": digest,
                    "changed_fields": changed,
                    "duplicate_policy": bridge.duplicate_policy,
                },
            )
            bridge.mark_seen()
            return {"status": status, "guest_id": str(existing.id)}

        guest = register_guest(event=bridge.event, payload=mapped, source="google_form_bridge")
        submission.status = "accepted"
        submission.guest = guest
        submission.error = ""
        submission.payload_hash = digest
        submission.received_payload = payload
        submission.processed_at = timezone.now()
        submission.save(
            update_fields=[
                "status",
                "guest",
                "error",
                "payload_hash",
                "received_payload",
                "processed_at",
                "updated_at",
            ]
        )
        write_audit(
            organization=bridge.organization,
            event=bridge.event,
            guest=guest,
            actor_type="integration",
            actor_id=str(bridge.id),
            action="integration.google_form_guest_created",
            result="success",
            entry_token=guest.entry_token,
            details={
                "bridge_id": str(bridge.id),
                "submission_id": submission_id,
                "payload_hash": digest,
                "mapped_keys": sorted(mapped.keys()),
                "duplicate_policy": bridge.duplicate_policy,
            },
        )
        bridge.mark_seen()
        return {"status": "accepted", "guest_id": str(guest.id)}
    except (EventNotOpen, RegistrationError, GoogleFormBridgeError) as exc:
        reason = str(exc)
        submission.status = "rejected"
        submission.error = reason
        submission.payload_hash = digest
        submission.received_payload = payload
        submission.processed_at = timezone.now()
        submission.save(
            update_fields=[
                "status",
                "error",
                "payload_hash",
                "received_payload",
                "processed_at",
                "updated_at",
            ]
        )
        _audit_rejection(
            bridge=bridge,
            submission_id=submission_id,
            digest=digest,
            reason=reason,
            submission=submission,
        )
        return {"status": "rejected", "detail": reason}
```

- [ ] **Step 4: Run service tests**

Run:

```bash
cd backend
uv run pytest tests/test_google_form_bridge_webhook.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/integrations/services.py backend/tests/test_google_form_bridge_webhook.py
git commit -m "feat(integrations): process google form submissions idempotently"
```

## Task 3: Backend admin API + secret-protected webhook

**Files:**

- Create: `backend/apps/integrations/serializers.py`
- Create: `backend/apps/integrations/urls.py`
- Create: `backend/apps/integrations/views.py`
- Modify: `backend/config/urls.py`
- Test: `backend/tests/test_google_form_bridge_admin_api.py`
- Modify: `backend/tests/test_google_form_bridge_webhook.py`

- [ ] **Step 1: Write failing admin API tests**

Create `backend/tests/test_google_form_bridge_admin_api.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.integrations.models import GoogleFormBridge
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="admin@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="admin")
    event = Event.objects.create(
        organization=org,
        name="Launch",
        slug="launch",
        registration_open=True,
    )
    seed_preset_fields(event)
    RegistrationField.objects.create(
        event=event,
        field_key="company",
        label_en="Company",
        required=False,
        order_index=99,
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, user, event


@pytest.mark.django_db
def test_create_bridge_returns_raw_secret_once(setup):
    client, org, user, event = setup
    resp = client.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/integrations/google-form-bridge/",
        {
            "name": "Click Cam Form",
            "field_mapping": {"Full Name": "name", "Email": "email", "Company": "company"},
            "enabled": True,
        },
        format="json",
    )

    assert resp.status_code == 201, resp.json()
    body = resp.json()
    assert body["name"] == "Click Cam Form"
    assert body["enabled"] is True
    assert body["secret"]
    assert "secret_hash" not in body
    assert GoogleFormBridge.objects.get(event=event).check_secret(body["secret"])


@pytest.mark.django_db
def test_list_bridge_never_returns_secret(setup):
    client, org, user, event = setup
    GoogleFormBridge.create_with_secret(event=event, created_by=user, name="Bridge")

    resp = client.get(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/integrations/google-form-bridge/"
    )

    assert resp.status_code == 200, resp.json()
    assert resp.json()["results"][0]["name"] == "Bridge"
    assert "secret" not in resp.json()["results"][0]
    assert "secret_hash" not in resp.json()["results"][0]


@pytest.mark.django_db
def test_update_rejects_unknown_mapping_target(setup):
    client, org, user, event = setup
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    resp = client.patch(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/integrations/google-form-bridge/{bridge.id}/",
        {"field_mapping": {"Full Name": "not_a_field"}},
        format="json",
    )

    assert resp.status_code == 400
    assert "not valid" in str(resp.json())


@pytest.mark.django_db
def test_rotate_secret_returns_new_secret_once(setup):
    client, org, user, event = setup
    bridge, old_secret = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    resp = client.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/integrations/google-form-bridge/{bridge.id}/rotate-secret/"
    )

    assert resp.status_code == 200, resp.json()
    new_secret = resp.json()["secret"]
    bridge.refresh_from_db()
    assert bridge.check_secret(new_secret)
    assert not bridge.check_secret(old_secret)
```

- [ ] **Step 2: Add webhook endpoint tests**

Append these tests to `backend/tests/test_google_form_bridge_webhook.py`:

```python
from rest_framework.test import APIClient


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_webhook_rejects_wrong_secret_without_guest_mutation(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup
    client = APIClient()

    resp = client.post(
        f"/api/v1/integrations/google-forms/{bridge.id}/submissions/",
        data=_payload(),
        format="json",
        HTTP_X_EVENTGATE_BRIDGE_SECRET="wrong",
    )

    assert resp.status_code == 401
    assert Guest.objects.filter(event=event).count() == 0
    mock_delay.assert_not_called()


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_webhook_accepts_right_secret_and_returns_guest_id(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup
    client = APIClient()

    resp = client.post(
        f"/api/v1/integrations/google-forms/{bridge.id}/submissions/",
        data=_payload(),
        format="json",
        HTTP_X_EVENTGATE_BRIDGE_SECRET=raw_secret,
    )

    assert resp.status_code == 201, resp.json()
    assert resp.json()["status"] == "accepted"
    assert Guest.objects.filter(event=event, email="alice@example.com").exists()
```

- [ ] **Step 3: Run API tests to verify failure**

Run:

```bash
cd backend
uv run pytest tests/test_google_form_bridge_admin_api.py tests/test_google_form_bridge_webhook.py -q
```

Expected: FAIL with missing routes or missing serializers/views.

- [ ] **Step 4: Implement serializers**

Create `backend/apps/integrations/serializers.py`:

```python
from __future__ import annotations

from rest_framework import serializers

from apps.events.models import RegistrationField
from apps.integrations.models import GoogleFormBridge, GoogleFormSubmission


def event_field_keys(event) -> set[str]:
    return set(RegistrationField.objects.filter(event=event).values_list("field_key", flat=True))


class GoogleFormBridgeSerializer(serializers.ModelSerializer):
    webhook_url = serializers.SerializerMethodField()
    recent_submissions = serializers.SerializerMethodField()

    class Meta:
        model = GoogleFormBridge
        fields = (
            "id",
            "name",
            "enabled",
            "field_mapping",
            "duplicate_policy",
            "webhook_url",
            "last_seen_at",
            "recent_submissions",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "webhook_url", "last_seen_at", "recent_submissions", "created_at", "updated_at")

    def validate_field_mapping(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("field_mapping must be an object.")
        event = self.context["event"]
        allowed = event_field_keys(event)
        for label, target in value.items():
            if not isinstance(label, str) or not label.strip():
                raise serializers.ValidationError("Google field labels must be non-empty strings.")
            if target not in allowed:
                raise serializers.ValidationError(f"Mapping target '{target}' is not valid for this event.")
        return value

    def get_webhook_url(self, obj: GoogleFormBridge) -> str:
        request = self.context.get("request")
        path = f"/api/v1/integrations/google-forms/{obj.id}/submissions/"
        if request:
            return request.build_absolute_uri(path)
        return path

    def get_recent_submissions(self, obj: GoogleFormBridge):
        rows = obj.submissions.order_by("-created_at")[:5]
        return [
            {
                "id": str(row.id),
                "submission_id": row.submission_id,
                "status": row.status,
                "error": row.error,
                "created_at": row.created_at,
                "processed_at": row.processed_at,
            }
            for row in rows
        ]


class GoogleFormBridgeCreateSerializer(GoogleFormBridgeSerializer):
    secret = serializers.CharField(read_only=True)

    class Meta(GoogleFormBridgeSerializer.Meta):
        fields = GoogleFormBridgeSerializer.Meta.fields + ("secret",)


class GoogleFormSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = GoogleFormSubmission
        fields = ("id", "submission_id", "status", "guest", "error", "created_at", "processed_at")
        read_only_fields = fields
```

- [ ] **Step 5: Implement views and urls**

Create `backend/apps/integrations/views.py`:

```python
from __future__ import annotations

from typing import ClassVar

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.events.models import Event
from apps.integrations.models import GoogleFormBridge
from apps.integrations.serializers import (
    GoogleFormBridgeCreateSerializer,
    GoogleFormBridgeSerializer,
)
from apps.integrations.services import GoogleFormBridgeError, process_google_form_submission
from apps.orgs.views import StandardPagination


class GoogleFormBridgeListCreateView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")
    pagination_class = StandardPagination

    def get_event(self, request: Request, event_slug: str) -> Event:
        return get_object_or_404(Event, organization=request.organization, slug=event_slug)

    def get(self, request: Request, org_slug: str, event_slug: str) -> Response:
        event = self.get_event(request, event_slug)
        bridges = GoogleFormBridge.objects.filter(event=event).order_by("-created_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(bridges, request, view=self)
        serializer = GoogleFormBridgeSerializer(
            page or bridges,
            many=True,
            context={"request": request, "event": event},
        )
        if page is not None:
            return paginator.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def post(self, request: Request, org_slug: str, event_slug: str) -> Response:
        event = self.get_event(request, event_slug)
        serializer = GoogleFormBridgeCreateSerializer(
            data=request.data,
            context={"request": request, "event": event},
        )
        serializer.is_valid(raise_exception=True)
        bridge, raw_secret = GoogleFormBridge.create_with_secret(
            event=event,
            created_by=request.user,
            name=serializer.validated_data.get("name", "Google Form"),
            field_mapping=serializer.validated_data.get("field_mapping", {}),
            duplicate_policy=serializer.validated_data.get("duplicate_policy", "upsert_by_email"),
        )
        bridge.enabled = serializer.validated_data.get("enabled", False)
        bridge.save(update_fields=["enabled"])
        body = GoogleFormBridgeCreateSerializer(
            bridge,
            context={"request": request, "event": event},
        ).data
        body["secret"] = raw_secret
        return Response(body, status=status.HTTP_201_CREATED)


class GoogleFormBridgeDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def get_bridge(self, request: Request, event_slug: str, bridge_id) -> tuple[Event, GoogleFormBridge]:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        bridge = get_object_or_404(GoogleFormBridge, id=bridge_id, event=event)
        return event, bridge

    def get(self, request: Request, org_slug: str, event_slug: str, bridge_id) -> Response:
        event, bridge = self.get_bridge(request, event_slug, bridge_id)
        return Response(
            GoogleFormBridgeSerializer(
                bridge,
                context={"request": request, "event": event},
            ).data
        )

    def patch(self, request: Request, org_slug: str, event_slug: str, bridge_id) -> Response:
        event, bridge = self.get_bridge(request, event_slug, bridge_id)
        serializer = GoogleFormBridgeSerializer(
            bridge,
            data=request.data,
            partial=True,
            context={"request": request, "event": event},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class GoogleFormBridgeRotateSecretView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def post(self, request: Request, org_slug: str, event_slug: str, bridge_id) -> Response:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        bridge = get_object_or_404(GoogleFormBridge, id=bridge_id, event=event)
        raw_secret = bridge.rotate_secret()
        body = GoogleFormBridgeCreateSerializer(
            bridge,
            context={"request": request, "event": event},
        ).data
        body["secret"] = raw_secret
        return Response(body)


class GoogleFormSubmissionWebhookView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request: Request, bridge_id) -> Response:
        bridge = get_object_or_404(GoogleFormBridge.objects.select_related("event__organization"), id=bridge_id)
        raw_secret = request.headers.get("X-Eventgate-Bridge-Secret", "")
        if not bridge.check_secret(raw_secret):
            return Response({"detail": "Invalid bridge secret."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            result = process_google_form_submission(bridge=bridge, payload=request.data)
        except GoogleFormBridgeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        response_status = status.HTTP_201_CREATED if result.get("status") == "accepted" else status.HTTP_200_OK
        return Response(result, status=response_status)
```

Create `backend/apps/integrations/urls.py`:

```python
from django.urls import path

from apps.integrations.views import (
    GoogleFormBridgeDetailView,
    GoogleFormBridgeListCreateView,
    GoogleFormBridgeRotateSecretView,
    GoogleFormSubmissionWebhookView,
)

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/",
        GoogleFormBridgeListCreateView.as_view(),
        name="google-form-bridge-list",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/<uuid:bridge_id>/",
        GoogleFormBridgeDetailView.as_view(),
        name="google-form-bridge-detail",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/<uuid:bridge_id>/rotate-secret/",
        GoogleFormBridgeRotateSecretView.as_view(),
        name="google-form-bridge-rotate-secret",
    ),
    path(
        "integrations/google-forms/<uuid:bridge_id>/submissions/",
        GoogleFormSubmissionWebhookView.as_view(),
        name="google-form-submission-webhook",
    ),
]
```

- [ ] **Step 6: Include integration URLs**

In `backend/config/urls.py`, add this include after notifications:

```python
    path("api/v1/", include("apps.integrations.urls")),
```

- [ ] **Step 7: Run API tests**

Run:

```bash
cd backend
uv run pytest tests/test_google_form_bridge_admin_api.py tests/test_google_form_bridge_webhook.py -q
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/integrations/serializers.py backend/apps/integrations/urls.py backend/apps/integrations/views.py backend/config/urls.py backend/tests/test_google_form_bridge_admin_api.py backend/tests/test_google_form_bridge_webhook.py
git commit -m "feat(integrations): google form bridge admin api and webhook"
```

## Task 4: Frontend API hooks for bridge settings

**Files:**

- Create: `frontend/lib/google-form-bridge.ts`

- [ ] **Step 1: Create frontend API library**

Create `frontend/lib/google-form-bridge.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type GoogleFormBridgeSubmissionSummary = {
  id: string;
  submission_id: string;
  status: "accepted" | "duplicate" | "updated" | "rejected";
  error: string;
  created_at: string;
  processed_at: string | null;
};

export type GoogleFormBridge = {
  id: string;
  name: string;
  enabled: boolean;
  field_mapping: Record<string, string>;
  duplicate_policy: "upsert_by_email" | "reject_duplicates";
  webhook_url: string;
  last_seen_at: string | null;
  recent_submissions: GoogleFormBridgeSubmissionSummary[];
  created_at: string;
  updated_at: string;
};

export type GoogleFormBridgeWithSecret = GoogleFormBridge & { secret: string };

type Paginated<T> = { count: number; results: T[] };

export type BridgeInput = {
  name?: string;
  enabled?: boolean;
  field_mapping?: Record<string, string>;
  duplicate_policy?: "upsert_by_email" | "reject_duplicates";
};

function bridgeBase(orgSlug: string, eventSlug: string) {
  return `/api/v1/orgs/${orgSlug}/events/${eventSlug}/integrations/google-form-bridge/`;
}

export function useGoogleFormBridges(orgSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ["google-form-bridges", orgSlug, eventSlug],
    queryFn: () =>
      apiFetch<Paginated<GoogleFormBridge>>(bridgeBase(orgSlug, eventSlug)),
    enabled: !!orgSlug && !!eventSlug,
  });
}

export function useCreateGoogleFormBridge(orgSlug: string, eventSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BridgeInput) =>
      apiFetch<GoogleFormBridgeWithSecret>(bridgeBase(orgSlug, eventSlug), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["google-form-bridges", orgSlug, eventSlug],
      }),
  });
}

export function useUpdateGoogleFormBridge(
  orgSlug: string,
  eventSlug: string,
  bridgeId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BridgeInput) =>
      apiFetch<GoogleFormBridge>(
        `${bridgeBase(orgSlug, eventSlug)}${bridgeId}/`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["google-form-bridges", orgSlug, eventSlug],
      }),
  });
}

export function useRotateGoogleFormBridgeSecret(
  orgSlug: string,
  eventSlug: string,
  bridgeId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<GoogleFormBridgeWithSecret>(
        `${bridgeBase(orgSlug, eventSlug)}${bridgeId}/rotate-secret/`,
        { method: "POST" },
      ),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["google-form-bridges", orgSlug, eventSlug],
      }),
  });
}
```

- [ ] **Step 2: Verify type-check**

Run:

```bash
cd frontend
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/google-form-bridge.ts
git commit -m "feat(frontend): google form bridge API hooks"
```

## Task 5: Frontend settings card for bridge setup

**Files:**

- Create: `frontend/components/integrations/google-form-bridge-card.tsx`
- Test: `frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({
  useFields: vi.fn(),
}));
vi.mock("@/lib/google-form-bridge", () => ({
  useGoogleFormBridges: vi.fn(),
  useCreateGoogleFormBridge: vi.fn(),
  useUpdateGoogleFormBridge: vi.fn(),
  useRotateGoogleFormBridgeSecret: vi.fn(),
}));

import { GoogleFormBridgeCard } from "@/components/integrations/google-form-bridge-card";
import { useFields } from "@/lib/events";
import {
  useCreateGoogleFormBridge,
  useGoogleFormBridges,
  useRotateGoogleFormBridgeSecret,
  useUpdateGoogleFormBridge,
} from "@/lib/google-form-bridge";

const mockFields = vi.mocked(useFields);
const mockBridges = vi.mocked(useGoogleFormBridges);
const mockCreate = vi.mocked(useCreateGoogleFormBridge);
const mockUpdate = vi.mocked(useUpdateGoogleFormBridge);
const mockRotate = vi.mocked(useRotateGoogleFormBridgeSecret);

beforeEach(() => {
  vi.clearAllMocks();
  mockFields.mockReturnValue({
    data: {
      results: [
        {
          field_key: "name",
          label_en: "Full name",
          label_km: "",
          field_type: "text",
          required: true,
        },
        {
          field_key: "email",
          label_en: "Email",
          label_km: "",
          field_type: "email",
          required: true,
        },
        {
          field_key: "phone_or_chat",
          label_en: "Phone",
          label_km: "",
          field_type: "phone",
          required: false,
        },
      ],
    },
  } as never);
  mockCreate.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as never);
  mockUpdate.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as never);
  mockRotate.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as never);
});

describe("GoogleFormBridgeCard", () => {
  it("shows the empty setup state", () => {
    mockBridges.mockReturnValue({
      data: { count: 0, results: [] },
      isLoading: false,
    } as never);
    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);
    expect(screen.getByText("Google Form bridge")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create bridge" }),
    ).toBeInTheDocument();
  });

  it("creates a bridge and displays the one-time secret", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "b1",
      name: "Click Cam Form",
      enabled: false,
      field_mapping: {},
      duplicate_policy: "upsert_by_email",
      webhook_url:
        "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
      last_seen_at: null,
      recent_submissions: [],
      created_at: "2026-06-07T00:00:00Z",
      updated_at: "2026-06-07T00:00:00Z",
      secret: "secret-123",
    });
    mockBridges.mockReturnValue({
      data: { count: 0, results: [] },
      isLoading: false,
    } as never);
    mockCreate.mockReturnValue({
      mutateAsync: create,
      isPending: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);
    fireEvent.click(screen.getByRole("button", { name: "Create bridge" }));

    expect(await screen.findByText(/secret-123/)).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({
      name: "Google Form",
      enabled: false,
      duplicate_policy: "upsert_by_email",
      field_mapping: {},
    });
  });

  it("shows existing webhook URL and Apps Script snippet", () => {
    mockBridges.mockReturnValue({
      data: {
        count: 1,
        results: [
          {
            id: "b1",
            name: "Click Cam Form",
            enabled: true,
            field_mapping: { "Full Name": "name" },
            duplicate_policy: "upsert_by_email",
            webhook_url:
              "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
            last_seen_at: null,
            recent_submissions: [],
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);
    expect(screen.getByDisplayValue(/api.test/)).toBeInTheDocument();
    expect(screen.getByText(/function onFormSubmit/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend
pnpm exec vitest run __tests__/components/integrations/google-form-bridge-card.test.tsx
```

Expected: FAIL with missing component module.

- [ ] **Step 3: Implement the settings card**

Create `frontend/components/integrations/google-form-bridge-card.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useFields } from "@/lib/events";
import {
  type BridgeInput,
  useCreateGoogleFormBridge,
  useGoogleFormBridges,
  useRotateGoogleFormBridgeSecret,
  useUpdateGoogleFormBridge,
} from "@/lib/google-form-bridge";

function scriptFor(webhookUrl: string) {
  return `const EVENTGATE_WEBHOOK_URL = "${webhookUrl}";
const EVENTGATE_BRIDGE_SECRET = PropertiesService.getScriptProperties().getProperty("EVENTGATE_BRIDGE_SECRET");
const STATUS_COLUMN_NAME = "Eventgate Sync";

function onFormSubmit(e) {
  if (!EVENTGATE_BRIDGE_SECRET) throw new Error("Missing EVENTGATE_BRIDGE_SECRET script property.");
  const values = e.namedValues || {};
  const email = firstValue(values["Email"]);
  const submittedAt = new Date().toISOString();
  const submissionId = [
    "sheet",
    e.range ? e.range.getRow() : submittedAt,
    email || submittedAt
  ].join("-");

  const payload = {
    submission_id: submissionId,
    submitted_at: submittedAt,
    fields: values
  };

  const response = UrlFetchApp.fetch(EVENTGATE_WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Eventgate-Bridge-Secret": EVENTGATE_BRIDGE_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  writeSyncStatus(e, response.getResponseCode() + " " + response.getContentText());
}

function firstValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function writeSyncStatus(e, status) {
  if (!e.range) return;
  const sheet = e.range.getSheet();
  const headerRow = 1;
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  let col = headers.indexOf(STATUS_COLUMN_NAME) + 1;
  if (col === 0) {
    col = sheet.getLastColumn() + 1;
    sheet.getRange(headerRow, col).setValue(STATUS_COLUMN_NAME);
  }
  sheet.getRange(e.range.getRow(), col).setValue(status);
}`;
}

type Props = { orgSlug: string; eventSlug: string };

export function GoogleFormBridgeCard({ orgSlug, eventSlug }: Props) {
  const bridges = useGoogleFormBridges(orgSlug, eventSlug);
  const fields = useFields(orgSlug, eventSlug);
  const create = useCreateGoogleFormBridge(orgSlug, eventSlug);
  const bridge = bridges.data?.results[0] ?? null;
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);

  const update = useUpdateGoogleFormBridge(
    orgSlug,
    eventSlug,
    bridge?.id ?? "",
  );
  const rotate = useRotateGoogleFormBridgeSecret(
    orgSlug,
    eventSlug,
    bridge?.id ?? "",
  );

  const fieldOptions = fields.data?.results ?? [];
  const script = useMemo(
    () => scriptFor(bridge?.webhook_url ?? ""),
    [bridge?.webhook_url],
  );

  const onCreate = async () => {
    const created = await create.mutateAsync({
      name: "Google Form",
      enabled: false,
      duplicate_policy: "upsert_by_email",
      field_mapping: {},
    });
    setOneTimeSecret(created.secret);
  };

  const onRotate = async () => {
    if (!bridge) return;
    const rotated = await rotate.mutateAsync();
    setOneTimeSecret(rotated.secret);
  };

  const patchBridge = async (input: BridgeInput) => {
    if (!bridge) return;
    await update.mutateAsync(input);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Form bridge</CardTitle>
        <CardDescription>
          Optional pilot bridge for syncing Google Form responses into this
          Eventgate guest list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!bridge && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Create a bridge, map Google Form labels to Eventgate fields, then
              install the Apps Script trigger in the response Sheet.
            </p>
            <Button onClick={onCreate} disabled={create.isPending}>
              {create.isPending ? "Creating..." : "Create bridge"}
            </Button>
          </div>
        )}

        {bridge && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={bridge.enabled}
                onChange={(e) =>
                  void patchBridge({ enabled: e.target.checked })
                }
                className="size-4 rounded accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              Enabled
            </label>

            <Field label="Webhook URL" htmlFor="google-bridge-webhook">
              <Input
                id="google-bridge-webhook"
                readOnly
                value={bridge.webhook_url}
              />
            </Field>

            {oneTimeSecret && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="font-semibold">
                  Copy this secret now. It is shown once.
                </p>
                <p className="mt-1 break-all font-mono">{oneTimeSecret}</p>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRotate}
            >
              Rotate secret
            </Button>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Field mapping</p>
              {Object.entries(bridge.field_mapping).map(
                ([googleLabel, target]) => (
                  <div
                    key={googleLabel}
                    className="grid gap-2 sm:grid-cols-[1fr_220px]"
                  >
                    <Input readOnly value={googleLabel} />
                    <Select
                      value={target}
                      onChange={(e) =>
                        void patchBridge({
                          field_mapping: {
                            ...bridge.field_mapping,
                            [googleLabel]: e.target.value,
                          },
                        })
                      }
                    >
                      {fieldOptions.map((field) => (
                        <option key={field.field_key} value={field.field_key}>
                          {field.label_en}
                        </option>
                      ))}
                    </Select>
                  </div>
                ),
              )}
              {Object.keys(bridge.field_mapping).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No labels mapped yet. Add labels after the first rehearsal
                  response or configure them through the API while preparing the
                  pilot.
                </p>
              )}
            </div>

            <Field label="Apps Script" htmlFor="google-bridge-script">
              <textarea
                id="google-bridge-script"
                readOnly
                value={script}
                rows={16}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none"
              />
            </Field>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run component tests**

Run:

```bash
cd frontend
pnpm exec vitest run __tests__/components/integrations/google-form-bridge-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/integrations/google-form-bridge-card.tsx frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx
git commit -m "feat(integrations): google form bridge settings card"
```

## Task 6: Mount bridge settings on event settings page

**Files:**

- Modify: `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/settings/page.tsx`

- [ ] **Step 1: Edit settings page**

Replace `frontend/app/(app)/orgs/[slug]/events/[eventSlug]/settings/page.tsx` with:

```tsx
"use client";

import { useParams } from "next/navigation";

import { PinManagementCard } from "@/components/events/pin-management-card";
import { WalkinSettingsCard } from "@/components/events/walkin-settings-card";
import { GoogleFormBridgeCard } from "@/components/integrations/google-form-bridge-card";

export default function EventSettingsPage() {
  const { slug, eventSlug } = useParams<{ slug: string; eventSlug: string }>();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Event settings</h1>
        <p className="text-sm text-muted-foreground">
          Door-day controls, walk-in capacity, and optional pilot integrations.
        </p>
      </div>
      <PinManagementCard orgSlug={slug} eventSlug={eventSlug} />
      <WalkinSettingsCard orgSlug={slug} eventSlug={eventSlug} />
      <GoogleFormBridgeCard orgSlug={slug} eventSlug={eventSlug} />
    </div>
  );
}
```

- [ ] **Step 2: Run frontend gates**

Run:

```bash
cd frontend
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'frontend/app/(app)/orgs/[slug]/events/[eventSlug]/settings/page.tsx'
git commit -m "feat(settings): surface google form bridge on event settings"
```

## Task 7: Apps Script install guide

**Files:**

- Create: `docs/runbooks/google-form-bridge-apps-script.md`

- [ ] **Step 1: Write the install guide**

Create `docs/runbooks/google-form-bridge-apps-script.md`:

````markdown
# Google Form bridge Apps Script install guide

Use this for the Click Cam pilot when the customer wants to keep using a Google Form
or its response Sheet while Eventgate owns QR issuance, guest records, scanning,
help desk, and audit.

## When to use this bridge

Use it only when all are true:

- The customer already has a Google Form or response Sheet.
- Eventgate native registration is not the preferred intake path for this pilot.
- A test form submission has synced into Eventgate before the T-7 gate.

If the bridge is not green by 2026-06-12, disable it and use Eventgate native
registration or CSV import.

## Eventgate setup

1. Open the event in Eventgate.
2. Go to Settings.
3. Create a Google Form bridge.
4. Configure the field mapping.
5. Copy the webhook URL.
6. Copy the one-time secret.
7. Keep the bridge disabled until the Apps Script is installed.

## Google Sheet setup

1. Open the Google Form response Sheet.
2. Open Extensions -> Apps Script.
3. Paste the script below.
4. Replace the `EVENTGATE_WEBHOOK_URL` constant with the bridge URL copied from Eventgate.
5. Open Project Settings -> Script properties.
6. Add `EVENTGATE_BRIDGE_SECRET` with the one-time bridge secret copied from Eventgate.
7. Save the script.
8. In Apps Script, open Triggers.
9. Add a trigger:
   - Function: `onFormSubmit`
   - Event source: From spreadsheet
   - Event type: On form submit
10. Submit a test Google Form response.
11. Confirm the response row gets an Eventgate Sync value.
12. Confirm the guest appears in Eventgate.
13. Enable the bridge after the test passes.

## Sheet-bound script

```javascript
const EVENTGATE_WEBHOOK_URL =
  "https://api.eventgate.byondr.co/api/v1/integrations/google-forms/BRIDGE_ID/submissions/";
const EVENTGATE_BRIDGE_SECRET =
  PropertiesService.getScriptProperties().getProperty(
    "EVENTGATE_BRIDGE_SECRET",
  );
const STATUS_COLUMN_NAME = "Eventgate Sync";

function onFormSubmit(e) {
  if (!EVENTGATE_BRIDGE_SECRET)
    throw new Error("Missing EVENTGATE_BRIDGE_SECRET script property.");
  const values = e.namedValues || {};
  const email = firstValue(values["Email"]);
  const submittedAt = new Date().toISOString();
  const submissionId = [
    "sheet",
    e.range ? e.range.getRow() : submittedAt,
    email || submittedAt,
  ].join("-");

  const payload = {
    submission_id: submissionId,
    submitted_at: submittedAt,
    fields: values,
  };

  const response = postToEventgate(payload);
  writeSyncStatus(
    e,
    response.getResponseCode() + " " + response.getContentText(),
  );
}

function postToEventgate(payload) {
  const options = {
    method: "post",
    contentType: "application/json",
    headers: { "X-Eventgate-Bridge-Secret": EVENTGATE_BRIDGE_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const first = UrlFetchApp.fetch(EVENTGATE_WEBHOOK_URL, options);
  if (first.getResponseCode() >= 500) {
    Utilities.sleep(1000);
    return UrlFetchApp.fetch(EVENTGATE_WEBHOOK_URL, options);
  }
  return first;
}

function firstValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function writeSyncStatus(e, status) {
  if (!e.range) return;
  const sheet = e.range.getSheet();
  const headerRow = 1;
  const headers = sheet
    .getRange(headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  let col = headers.indexOf(STATUS_COLUMN_NAME) + 1;
  if (col === 0) {
    col = sheet.getLastColumn() + 1;
    sheet.getRange(headerRow, col).setValue(STATUS_COLUMN_NAME);
  }
  sheet.getRange(e.range.getRow(), col).setValue(status);
}
```
````

## Manual retry

If a row says failed but the Eventgate event is healthy:

1. Fix the field mapping or secret.
2. Open Apps Script.
3. Select the failed row in the Sheet.
4. Re-submit the form if possible, or use CSV import for the unsynced rows.

Eventgate idempotency prevents duplicate guests when the same `submission_id` is
sent twice.

## Disable procedure

1. In Eventgate Settings, uncheck Enabled for the bridge.
2. Leave the Apps Script installed if the customer still wants logs.
3. Unsynced rows can be imported by CSV before the event.

````

- [ ] **Step 2: Verify markdown formatting**

Run:

```bash
cd frontend
pnpm prettier --check ../docs/runbooks/google-form-bridge-apps-script.md
````

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/google-form-bridge-apps-script.md
git commit -m "docs(integrations): google form bridge Apps Script guide"
```

## Task 8: Plan N verification checklist + pilot runbook update

**Files:**

- Create: `docs/plans/2026-06-07-plan-n-verification-checklist.md`
- Modify: `docs/plans/2026-05-23-pilot-launch-runbook.md`

- [ ] **Step 1: Create Plan N verification checklist**

Create `docs/plans/2026-06-07-plan-n-verification-checklist.md`:

````markdown
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
````

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

````

- [ ] **Step 2: Patch the pilot runbook**

In `docs/plans/2026-05-23-pilot-launch-runbook.md`, add this subsection after the existing `1.5 End-to-end smoke` section:

```markdown
### 1.5a Google Form bridge smoke (optional Plan N path)

Run this section only if Click Cam keeps its Google Form as a live intake path.
If any required check fails by 2026-06-12, disable the bridge and use native
Eventgate registration or CSV import.

- [ ] Event settings show a Google Form bridge with `enabled=true`.
- [ ] The response Sheet has the Sheet-bound Apps Script from
  `docs/runbooks/google-form-bridge-apps-script.md`.
- [ ] A test Google Form response creates exactly one Eventgate guest.
- [ ] The test guest receives one QR email.
- [ ] Re-running the same row does not create a duplicate guest.
- [ ] A bad test row writes `rejected` in the Sheet sync column and creates an
  `integration.google_form_submission_rejected` audit row.
- [ ] If the bridge is disabled, a test submission returns a clean disabled response
  and creates no guest.
````

Also add this bullet to the post-mortem `6.7 Operator + customer feedback` area:

```markdown
- **Google workflow** - did keeping Google Form intake reduce friction, or did it
  create extra coordination work compared with Eventgate native registration?
```

- [ ] **Step 3: Verify markdown formatting**

Run:

```bash
cd frontend
pnpm prettier --check ../docs/plans/2026-06-07-plan-n-verification-checklist.md ../docs/plans/2026-05-23-pilot-launch-runbook.md
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-07-plan-n-verification-checklist.md docs/plans/2026-05-23-pilot-launch-runbook.md
git commit -m "docs(plan-n): verification checklist and pilot runbook bridge gate"
```

## Task 9: Full verification gate

**Files:** none unless formatting changes.

- [ ] **Step 1: Run backend test suite**

Run:

```bash
docker start eventgate-postgres-1 || docker compose up -d postgres
cd backend
uv run pytest -q
```

Expected: all tests pass.

- [ ] **Step 2: Run backend mypy**

Run:

```bash
cd backend
uv run mypy apps config
```

Expected: `Success: no issues found`.

- [ ] **Step 3: Run frontend suite and gates**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd frontend
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
```

Expected: tests pass, typecheck clean, lint clean, format clean.

- [ ] **Step 4: Scan for scope creep markers**

Run:

```bash
rg -n "OAuth|Pub/Sub|Forms API watch|ALLOWED_HOSTS|refresh-token|custom domain|billing" backend frontend docs/plans/2026-06-07-plan-n-verification-checklist.md docs/runbooks/google-form-bridge-apps-script.md
```

Expected: only deliberate non-goal or runbook references; no implementation of deferred scope.

- [ ] **Step 5: Commit formatting-only changes if hooks changed files**

If formatting changed files:

```bash
git status --short
git add backend/apps/integrations backend/tests/test_google_form_bridge_models.py backend/tests/test_google_form_bridge_admin_api.py backend/tests/test_google_form_bridge_webhook.py backend/config/settings/base.py backend/config/urls.py frontend/lib/google-form-bridge.ts frontend/components/integrations/google-form-bridge-card.tsx frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx 'frontend/app/(app)/orgs/[slug]/events/[eventSlug]/settings/page.tsx' docs/runbooks/google-form-bridge-apps-script.md docs/plans/2026-06-07-plan-n-verification-checklist.md docs/plans/2026-05-23-pilot-launch-runbook.md
git commit -m "chore(plan-n): format integration bridge changes"
```

Expected: commit succeeds. If no files changed, skip this step.

## Self-Review

- **Spec coverage:** Track A is covered by Tasks 1-7. Track B is covered by Task 8 and Task 9. T-7/T-3/T-1 gate language is included in the verification checklist and runbook update. OAuth/PubSub/two-way sync are excluded by scope and scan step.
- **Placeholder scan:** no task contains unspecified implementation work; each code-writing step includes concrete file content or exact insertion text.
- **Type consistency:** model names (`GoogleFormBridge`, `GoogleFormSubmission`), route names, status strings, audit actions, and frontend hook names are consistent across tasks.
- **Implementation risk:** Task 5 intentionally keeps mapping UI minimal. The API supports full mapping, and the first pilot can configure mapping with the settings card once labels are known or through API during rehearsal.
