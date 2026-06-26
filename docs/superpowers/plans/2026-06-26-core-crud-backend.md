# Core CRUD — Backend Implementation Plan (Corrective CRUD, Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the backend for corrective CRUD — editable event slug with an
alias/redirect + short-URL repoint, a guarded event hard-delete, and guest
edit / void / guarded hard-delete — all audit-logged.

**Architecture:** Purely additive to `apps.events`, `apps.guests`, and a new
`EventSlugAlias` model. Event editing already works through `EventSerializer`
(name/slug/dates/timezone are not read-only); this plan adds the missing
*validation* and *side-effects* (alias + short-URL repoint) plus the delete and
guest endpoints. The frontend (event-details form, guest-edit drawer, table
affordances) and the list-scaling work are **separate plans**; this one ships a
testable API on its own.

**Tech Stack:** Django + DRF + pytest (PostgreSQL test DB).

## Global Constraints

- **Commit style:** single-line Conventional Commits, **NO `Co-Authored-By`
  trailer** (project convention).
- **Backend test runner:** `docker start eventgate-postgres-1` then
  `cd backend && uv run pytest -q`. Tests live flat in `backend/tests/`.
- **Type gate:** `cd backend && uv run mypy apps config` must stay clean.
- **Audit is append-only.** A `BEFORE UPDATE OR DELETE` trigger
  (`apps/audit/migrations/0002`) raises on any UPDATE/DELETE of `audit_auditevent`.
  `audit.event` is `PROTECT`; `audit.guest` is `SET_NULL`. Consequences baked
  into this plan: an `event.deleted` audit row must be written with **`event=None`**;
  a `guest.deleted` row with **`guest=None`**; and hard-delete is permitted only
  when the entity has **no audit rows**.
- **Audit writer:** `from apps.audit.services import write_audit`. Signature:
  `write_audit(*, organization, event=None, guest=None, actor_type, actor_id,
  action, result, previous_status="", new_status="", gate="", scanner="",
  entry_token="", details=None) -> AuditEvent`. `actor_type` for an admin user is
  `"user"`, `actor_id = str(request.user.id)`, `result="success"`.
- **Permissions:** mutations use `permission_classes = (IsAuthenticated,
  IsOrgMember, HasOrgRole)` with `required_org_roles = ("owner", "admin",
  "manager")` (from `apps.common.permissions`). `IsOrgMember` reads `org_slug`
  from the URL and sets `request.organization` + `request.org_role`.
- **Test auth pattern** (mirror `tests/test_google_form_bridge_admin_api.py`):
  create `Organization`, `User` (`User.objects.create_user(email=…, password="x")`),
  `OrganizationMembership(organization=, user=, role="owner")`, `Event`, then
  `client = APIClient(); client.force_authenticate(user=user)`.

---

## Task 1: `EventSlugAlias` model + migration

**Files:**
- Modify: `backend/apps/events/models.py` (append a model)
- Create: `backend/apps/events/migrations/<generated>_eventslugalias.py`
- Test: `backend/tests/test_event_slug_alias_model.py`

**Interfaces:**
- Produces: `EventSlugAlias(organization FK, event FK CASCADE related_name="slug_aliases", slug, created_at)`, `unique_together(organization, slug)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_event_slug_alias_model.py
import pytest
from django.db import IntegrityError

from apps.events.models import Event, EventSlugAlias
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_slug_alias_unique_per_org():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    EventSlugAlias.objects.create(organization=org, event=event, slug="old-launch")
    with pytest.raises(IntegrityError):
        EventSlugAlias.objects.create(organization=org, event=event, slug="old-launch")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_event_slug_alias_model.py -q`
Expected: FAIL — `ImportError: cannot import name 'EventSlugAlias'`.

- [ ] **Step 3: Add the model**

```python
# apps/events/models.py — append after RegistrationField
class EventSlugAlias(models.Model):
    """A retired event slug that still resolves (redirects) to its event.

    Created whenever an event's slug changes, so old public/registration links
    keep working. Resolution prefers a live Event with the requested slug;
    aliases are the fallback.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "orgs.Organization", on_delete=models.CASCADE, related_name="+"
    )
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="slug_aliases")
    slug = models.SlugField(max_length=80)
    created_at = models.DateTimeField(default=tz.now)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("organization", "slug"), name="unique_event_slug_alias_per_org"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.slug} → {self.event.slug}"
```

- [ ] **Step 4: Generate the migration**

Run: `cd backend && uv run python manage.py makemigrations events`
Expected: creates a migration adding `EventSlugAlias`.

- [ ] **Step 5: Run test + migration check**

Run: `cd backend && uv run pytest tests/test_event_slug_alias_model.py -q && uv run python manage.py makemigrations --check --dry-run`
Expected: PASS, no pending migrations.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/events/models.py backend/apps/events/migrations/ backend/tests/test_event_slug_alias_model.py
git commit -m "feat(events): add EventSlugAlias model for slug redirects"
```

---

## Task 2: Slug + date validation on `EventSerializer`

**Files:**
- Modify: `backend/apps/events/serializers.py` (`EventSerializer.validate`)
- Test: `backend/tests/test_event_edit.py`

**Interfaces:**
- Consumes: `EventSlugAlias` (Task 1).
- Produces: PATCH rejects a slug already used by another event or alias in the
  org (400, `{"slug": [...]}`) and `ends_at < starts_at` (400, `{"ends_at": [...]}`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_event_edit.py
import pytest
from rest_framework.test import APIClient

from apps.events.models import Event, EventSlugAlias
from apps.orgs.models import Organization, OrganizationMembership
from apps.accounts.models import User


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    other = Event.objects.create(organization=org, name="Gala", slug="gala")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, user, event, other


def url(org, event):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/"


@pytest.mark.django_db
def test_patch_rejects_slug_taken_by_other_event(setup):
    client, org, _user, event, _other = setup
    resp = client.patch(url(org, event), {"slug": "gala"}, format="json")
    assert resp.status_code == 400
    assert "slug" in resp.json()


@pytest.mark.django_db
def test_patch_rejects_slug_taken_by_alias(setup):
    client, org, _user, event, other = setup
    EventSlugAlias.objects.create(organization=org, event=other, slug="reserved")
    resp = client.patch(url(org, event), {"slug": "reserved"}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_patch_rejects_end_before_start(setup):
    client, org, _user, event, _other = setup
    resp = client.patch(
        url(org, event),
        {"starts_at": "2026-07-01T10:00:00Z", "ends_at": "2026-07-01T09:00:00Z"},
        format="json",
    )
    assert resp.status_code == 400
    assert "ends_at" in resp.json()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_event_edit.py -q`
Expected: FAIL — slug clash currently 500 (IntegrityError) or 200; date check absent.

- [ ] **Step 3: Add `validate` to `EventSerializer`**

```python
# apps/events/serializers.py — add import + method
from apps.events.models import Event, EventSlugAlias, RegistrationField  # extend existing import


class EventSerializer(serializers.ModelSerializer):
    # ... existing Meta unchanged ...

    def validate(self, attrs):
        instance = self.instance
        if instance is not None:
            org = instance.organization
            new_slug = attrs.get("slug")
            if new_slug and new_slug != instance.slug:
                clash = (
                    Event.objects.filter(organization=org, slug=new_slug)
                    .exclude(pk=instance.pk)
                    .exists()
                    or EventSlugAlias.objects.filter(organization=org, slug=new_slug)
                    .exclude(event=instance)
                    .exists()
                )
                if clash:
                    raise serializers.ValidationError(
                        {"slug": "This slug is already in use in this organization."}
                    )
        starts = attrs.get("starts_at", getattr(instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(instance, "ends_at", None))
        if starts and ends and ends < starts:
            raise serializers.ValidationError(
                {"ends_at": "End time must be on or after the start time."}
            )
        return attrs
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_event_edit.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/events/serializers.py backend/tests/test_event_edit.py
git commit -m "feat(events): validate slug uniqueness + date order on event edit"
```

---

## Task 3: Slug-rename side-effects (alias + short-URL repoint + audit)

**Files:**
- Modify: `backend/apps/events/services.py` (new `rename_event_slug`)
- Modify: `backend/apps/events/views.py` (`EventViewSet.perform_update`)
- Test: `backend/tests/test_event_edit.py` (add)

**Interfaces:**
- Consumes: `EventSlugAlias` (Task 1), `apps.shorturls.models.ShortUrl`, `write_audit`.
- Produces: `rename_event_slug(event: Event, old_slug: str) -> None` — idempotently
  records `EventSlugAlias(org, event, old_slug)` and rewrites every
  `ShortUrl.target_url` for the event from the old slug path to the new one.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_event_edit.py  (add; reuse `setup`, `url`)
from apps.shorturls.models import ShortUrl


@pytest.mark.django_db
def test_slug_change_creates_alias_and_repoints_short_url(setup, settings):
    client, org, _user, event, _other = setup
    su = ShortUrl.objects.create(
        short_code="abc123",
        target_url=f"/e/{org.slug}/{event.slug}/register",
        event=event,
    )
    resp = client.patch(url(org, event), {"slug": "launch-2026"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["slug"] == "launch-2026"
    assert EventSlugAlias.objects.filter(organization=org, slug="launch", event=event).exists()
    su.refresh_from_db()
    assert su.target_url == f"/e/{org.slug}/launch-2026/register"


@pytest.mark.django_db
def test_slug_change_writes_audit(setup):
    from apps.audit.models import AuditEvent

    client, org, _user, event, _other = setup
    client.patch(url(org, event), {"slug": "renamed"}, format="json")
    assert AuditEvent.objects.filter(action="event.updated", new_status="").exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_event_edit.py -k "slug_change" -q`
Expected: FAIL — no alias created, short URL unchanged, no audit row.

- [ ] **Step 3: Add the service**

```python
# apps/events/services.py — add
def rename_event_slug(event, old_slug: str) -> None:
    """Record an alias for the retired slug and repoint the event's short URLs."""
    from apps.events.models import EventSlugAlias
    from apps.shorturls.models import ShortUrl

    EventSlugAlias.objects.get_or_create(
        organization=event.organization, slug=old_slug, defaults={"event": event}
    )
    old_path = f"/e/{event.organization.slug}/{old_slug}/"
    new_path = f"/e/{event.organization.slug}/{event.slug}/"
    for su in ShortUrl.objects.filter(event=event):
        if old_path in su.target_url:
            su.target_url = su.target_url.replace(old_path, new_path)
            su.save(update_fields=["target_url"])
```

- [ ] **Step 4: Wire it into the viewset**

```python
# apps/events/views.py — add imports
from apps.audit.services import write_audit
from apps.events.services import (
    PinTooShort,
    rename_event_slug,
    seed_preset_fields,
    set_event_pin,
    transition_event,
)

# apps/events/views.py — add to EventViewSet (after perform_create)
    @transaction.atomic
    def perform_update(self, serializer):
        old_slug = serializer.instance.slug
        event = serializer.save()
        if event.slug != old_slug:
            rename_event_slug(event, old_slug)
            write_audit(
                organization=event.organization,
                event=event,
                actor_type="user",
                actor_id=str(self.request.user.id),
                action="event.updated",
                result="success",
                details={"slug_changed": {"from": old_slug, "to": event.slug}},
            )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_event_edit.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/events/services.py backend/apps/events/views.py backend/tests/test_event_edit.py
git commit -m "feat(events): alias + short-url repoint on slug change"
```

---

## Task 4: Public resolver follows aliases

**Files:**
- Modify: `backend/apps/events/views.py` (`PublicEventDetailView.get`)
- Test: `backend/tests/test_event_edit.py` (add)

**Interfaces:**
- Produces: `GET /api/v1/e/<org>/<old_slug>/` resolves via `EventSlugAlias` to the
  current event and returns the payload (whose `slug` is the **current** slug).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_event_edit.py  (add)
@pytest.mark.django_db
def test_public_detail_follows_alias(setup):
    client, org, _user, event, _other = setup
    EventSlugAlias.objects.create(organization=org, event=event, slug="old-slug")
    resp = APIClient().get(f"/api/v1/e/{org.slug}/old-slug/")
    assert resp.status_code == 200
    assert resp.json()["slug"] == event.slug  # canonical, not the alias
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_event_edit.py -k alias -q`
Expected: FAIL — 404 (no Event with slug "old-slug").

- [ ] **Step 3: Add the alias fallback**

```python
# apps/events/views.py — add import
from django.http import Http404
from apps.events.models import Event, EventSlugAlias, RegistrationField  # extend existing import

# PublicEventDetailView.get — replace the first line
    def get(self, request, org_slug, event_slug):
        event = Event.objects.filter(organization__slug=org_slug, slug=event_slug).first()
        if event is None:
            alias = (
                EventSlugAlias.objects.filter(organization__slug=org_slug, slug=event_slug)
                .select_related("event")
                .first()
            )
            if alias is None:
                raise Http404
            event = alias.event
        # ... existing payload construction unchanged (uses event.slug) ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_event_edit.py -k alias -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/events/views.py backend/tests/test_event_edit.py
git commit -m "feat(events): public event detail resolves retired slugs via alias"
```

---

## Task 5: Guarded event hard-delete

**Files:**
- Modify: `backend/apps/events/views.py` (`EventViewSet.destroy`)
- Test: `backend/tests/test_event_edit.py` (add)

**Interfaces:**
- Produces: `DELETE /api/v1/orgs/<org>/events/<slug>/` → **204** only when the event
  has no guests and no audit rows; **409** otherwise. Permitted delete writes an
  `event.deleted` audit row with `event=None`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_event_edit.py  (add)
from apps.audit.services import write_audit
from apps.guests.models import Guest


@pytest.mark.django_db
def test_delete_empty_event_succeeds(setup):
    client, org, _user, event, _other = setup
    resp = client.delete(url(org, event))
    assert resp.status_code == 204
    assert not Event.objects.filter(pk=event.pk).exists()


@pytest.mark.django_db
def test_delete_blocked_when_event_has_guests(setup):
    client, org, _user, event, _other = setup
    Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered", entry_token="t1"
    )
    resp = client.delete(url(org, event))
    assert resp.status_code == 409
    assert Event.objects.filter(pk=event.pk).exists()


@pytest.mark.django_db
def test_delete_blocked_when_event_has_audit_history(setup):
    client, org, _user, event, _other = setup
    write_audit(
        organization=org, event=event, actor_type="user", actor_id="x",
        action="event.transition", result="success",
    )
    resp = client.delete(url(org, event))
    assert resp.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_event_edit.py -k delete -q`
Expected: FAIL — default destroy returns 204 even with guests/audit (or 500 via PROTECT on the audit case).

- [ ] **Step 3: Override `destroy`**

```python
# apps/events/views.py — add to EventViewSet
    def destroy(self, request, *args, **kwargs):
        from apps.audit.models import AuditEvent

        event = self.get_object()
        if event.guests.exists():
            return Response(
                {"detail": "This event has guests. Archive it instead of deleting."},
                status=status.HTTP_409_CONFLICT,
            )
        if AuditEvent.objects.filter(event=event).exists():
            return Response(
                {"detail": "This event has activity history. Archive it instead of deleting."},
                status=status.HTTP_409_CONFLICT,
            )
        write_audit(
            organization=event.organization,
            actor_type="user",
            actor_id=str(request.user.id),
            action="event.deleted",
            result="success",
            details={"slug": event.slug, "name": event.name, "event_id": str(event.id)},
        )
        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_event_edit.py -q`
Expected: PASS (whole file green).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/events/views.py backend/tests/test_event_edit.py
git commit -m "feat(events): guarded hard-delete (no guests, no audit history)"
```

---

## Task 6: Guest write serializer + `GuestDetailView` GET + route

**Files:**
- Modify: `backend/apps/guests/serializers.py` (new `GuestWriteSerializer`)
- Modify: `backend/apps/guests/views.py` (new `GuestDetailView`)
- Modify: `backend/apps/guests/urls.py` (route)
- Test: `backend/tests/test_guest_edit.py`

**Interfaces:**
- Produces:
  - `GuestWriteSerializer` — `fields = ("id","guest_type","entry_status","info_status","full_name","email","phone_or_chat","custom_fields","source","checked_in_at","created_at","updated_at")`, `read_only_fields = ("id","guest_type","entry_status","info_status","source","checked_in_at","created_at","updated_at")` (so PATCH only touches `full_name`/`email`/`phone_or_chat`/`custom_fields`).
  - `GuestDetailView.get` → 200 with the guest at `/api/v1/orgs/<org>/events/<event>/guests/<guest_id>/`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_guest_edit.py
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event
from apps.guests.models import Guest
from apps.orgs.models import Organization, OrganizationMembership


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Acme", slug="acme")
    user = User.objects.create_user(email="owner@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=user, role="owner")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    guest = Guest.objects.create(
        organization=org, event=event, guest_type="pre_registered",
        entry_token="tok-1", full_name="Ana", email="ana@x.com",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, org, event, guest


def guest_url(org, event, guest):
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/guests/{guest.id}/"


@pytest.mark.django_db
def test_guest_detail_get(setup):
    client, org, event, guest = setup
    resp = client.get(guest_url(org, event, guest))
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Ana"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_guest_edit.py -k detail_get -q`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Add the write serializer**

```python
# apps/guests/serializers.py — add
class GuestWriteSerializer(serializers.ModelSerializer):
    """Staff-editable guest view. Only contact + custom fields are writable;
    identity/status/token columns stay read-only."""

    class Meta:
        model = Guest
        fields = (
            "id", "guest_type", "entry_status", "info_status", "full_name",
            "email", "phone_or_chat", "custom_fields", "source", "checked_in_at",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "guest_type", "entry_status", "info_status", "source",
            "checked_in_at", "created_at", "updated_at",
        )
```

- [ ] **Step 4: Add the view + route**

```python
# apps/guests/views.py — add imports
from apps.common.permissions import HasOrgRole, IsOrgMember  # extend existing import
from apps.guests.serializers import (  # extend existing import
    CsvImportSerializer,
    GuestSerializer,
    GuestSyncSerializer,
    GuestWriteSerializer,
    RegistrationSubmitResponseSerializer,
)

# apps/guests/views.py — add view
class GuestDetailView(APIView):
    """GET/PATCH/DELETE a single guest.

    URL: /api/v1/orgs/<org>/events/<event>/guests/<guest_id>/
    """

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def _guest(self, request, event_slug, guest_id):
        return get_object_or_404(
            Guest, id=guest_id, organization=request.organization, event__slug=event_slug
        )

    def get(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = self._guest(request, event_slug, guest_id)
        return Response(GuestWriteSerializer(guest).data)
```

```python
# apps/guests/urls.py — add import GuestDetailView, then add BEFORE the
# send-qr-email / telegram-link routes (more specific paths still match fine,
# but keep the bare detail route grouped with them):
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/<uuid:guest_id>/",
        GuestDetailView.as_view(),
        name="guest-detail",
    ),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_guest_edit.py -k detail_get -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/guests/serializers.py backend/apps/guests/views.py backend/apps/guests/urls.py backend/tests/test_guest_edit.py
git commit -m "feat(guests): single-guest detail endpoint + write serializer"
```

---

## Task 7: Guest edit (PATCH) + audit

**Files:**
- Modify: `backend/apps/guests/views.py` (`GuestDetailView.patch`)
- Test: `backend/tests/test_guest_edit.py` (add)

**Interfaces:**
- Produces: `PATCH .../guests/<id>/` updates `full_name`/`email`/`phone_or_chat`/
  `custom_fields`; writes `guest.updated`; leaves `entry_token` + `entry_status`
  unchanged.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_guest_edit.py  (add)
@pytest.mark.django_db
def test_guest_patch_updates_contact_and_audits(setup):
    from apps.audit.models import AuditEvent

    client, org, event, guest = setup
    resp = client.patch(
        guest_url(org, event, guest),
        {"full_name": "Ana Lim", "email": "ana.lim@x.com"},
        format="json",
    )
    assert resp.status_code == 200
    guest.refresh_from_db()
    assert guest.full_name == "Ana Lim"
    assert guest.email == "ana.lim@x.com"
    assert guest.entry_token == "tok-1"  # unchanged
    assert AuditEvent.objects.filter(action="guest.updated", guest=guest).exists()


@pytest.mark.django_db
def test_guest_patch_cannot_change_entry_status(setup):
    client, org, event, guest = setup
    client.patch(guest_url(org, event, guest), {"entry_status": "checked_in"}, format="json")
    guest.refresh_from_db()
    assert guest.entry_status == "registered_not_arrived"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_guest_edit.py -k patch -q`
Expected: FAIL — `patch` not implemented (405).

- [ ] **Step 3: Implement `patch`**

```python
# apps/guests/views.py — add to GuestDetailView
    def patch(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = self._guest(request, event_slug, guest_id)
        ser = GuestWriteSerializer(guest, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        write_audit(
            organization=guest.organization,
            event=guest.event,
            guest=guest,
            actor_type="user",
            actor_id=str(request.user.id),
            action="guest.updated",
            result="success",
            details={"fields": sorted(request.data.keys())},
        )
        return Response(ser.data)
```

```python
# apps/guests/views.py — add to the existing imports
from apps.audit.services import write_audit
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_guest_edit.py -k patch -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/guests/views.py backend/tests/test_guest_edit.py
git commit -m "feat(guests): edit guest contact + custom fields (audited)"
```

---

## Task 8: Guest void (primary remove) + audit

**Files:**
- Modify: `backend/apps/guests/views.py` (new `GuestVoidView`)
- Modify: `backend/apps/guests/urls.py` (route)
- Test: `backend/tests/test_guest_edit.py` (add)

**Interfaces:**
- Produces: `POST .../guests/<id>/void/` sets `entry_status="voided"`, writes
  `guest.voided`, returns 200; idempotent.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_guest_edit.py  (add)
@pytest.mark.django_db
def test_guest_void_sets_status_and_audits(setup):
    from apps.audit.models import AuditEvent

    client, org, event, guest = setup
    resp = client.post(guest_url(org, event, guest) + "void/")
    assert resp.status_code == 200
    guest.refresh_from_db()
    assert guest.entry_status == "voided"
    assert AuditEvent.objects.filter(action="guest.voided", guest=guest).exists()
    # idempotent
    assert client.post(guest_url(org, event, guest) + "void/").status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_guest_edit.py -k void -q`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement the view + route**

```python
# apps/guests/views.py — add
class GuestVoidView(APIView):
    """POST /api/v1/orgs/<org>/events/<event>/guests/<id>/void/ — soft-remove."""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def post(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = get_object_or_404(
            Guest, id=guest_id, organization=request.organization, event__slug=event_slug
        )
        previous = guest.entry_status
        if guest.entry_status != "voided":
            guest.entry_status = "voided"
            guest.save(update_fields=["entry_status", "updated_at"])
        write_audit(
            organization=guest.organization,
            event=guest.event,
            guest=guest,
            actor_type="user",
            actor_id=str(request.user.id),
            action="guest.voided",
            result="success",
            previous_status=previous,
            new_status="voided",
        )
        return Response(GuestWriteSerializer(guest).data)
```

```python
# apps/guests/urls.py — add import GuestVoidView + route
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/<uuid:guest_id>/void/",
        GuestVoidView.as_view(),
        name="guest-void",
    ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_guest_edit.py -k void -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/guests/views.py backend/apps/guests/urls.py backend/tests/test_guest_edit.py
git commit -m "feat(guests): void (soft-remove) endpoint, audited"
```

---

## Task 9: Guarded guest hard-delete + final gate

**Files:**
- Modify: `backend/apps/guests/views.py` (`GuestDetailView.delete`)
- Test: `backend/tests/test_guest_edit.py` (add)

**Interfaces:**
- Produces: `DELETE .../guests/<id>/` → **204** only when the guest has no audit
  rows; **409** otherwise. Permitted delete writes a `guest.deleted` audit row
  with `guest=None`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_guest_edit.py  (add)
@pytest.mark.django_db
def test_guest_delete_succeeds_with_no_history(setup):
    from apps.audit.models import AuditEvent

    client, org, event, guest = setup
    resp = client.delete(guest_url(org, event, guest))
    assert resp.status_code == 204
    assert not Guest.objects.filter(pk=guest.pk).exists()
    assert AuditEvent.objects.filter(action="guest.deleted", guest__isnull=True).exists()


@pytest.mark.django_db
def test_guest_delete_blocked_with_history(setup):
    from apps.audit.services import write_audit

    client, org, event, guest = setup
    write_audit(
        organization=org, event=event, guest=guest, actor_type="user",
        actor_id="x", action="checkin.success", result="success",
    )
    resp = client.delete(guest_url(org, event, guest))
    assert resp.status_code == 409
    assert Guest.objects.filter(pk=guest.pk).exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_guest_edit.py -k delete -q`
Expected: FAIL — `delete` not implemented (405), or 500 on the history case.

- [ ] **Step 3: Implement `delete`**

```python
# apps/guests/views.py — add to GuestDetailView
    def delete(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        from apps.audit.models import AuditEvent

        guest = self._guest(request, event_slug, guest_id)
        if AuditEvent.objects.filter(guest=guest).exists():
            return Response(
                {"detail": "This guest has activity history. Void them instead of deleting."},
                status=status.HTTP_409_CONFLICT,
            )
        write_audit(
            organization=guest.organization,
            event=guest.event,
            actor_type="user",
            actor_id=str(request.user.id),
            action="guest.deleted",
            result="success",
            details={
                "guest_id": str(guest.id),
                "full_name": guest.full_name,
                "email": guest.email,
            },
        )
        guest.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Run the full backend suite + type gate + migration check**

Run: `cd backend && uv run pytest -q && uv run mypy apps config && uv run python manage.py makemigrations --check --dry-run`
Expected: ALL PASS, mypy clean, no pending migrations.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/guests/views.py backend/tests/test_guest_edit.py
git commit -m "feat(guests): guarded hard-delete (no audit history), void otherwise"
```

---

## Follow-up plans (not in this plan)

- **Plan A-Frontend:** event-details edit form + delete button on Settings; guest
  edit/void/delete drawer; `lib/events.ts` + `lib/guests.ts` hooks; public page
  slug-redirect; e2e.
- **Plan B:** list-scaling — event-list search/filter/sort/pagination UI, member
  pagination, guest-list sort (+ backend `SearchFilter`/`OrderingFilter`).

## Self-Review

- **Spec coverage:** event edit validation (T2) + slug alias/repoint (T1,T3) +
  public resolver (T4) + event delete guard (T5); guest detail/edit (T6,T7) +
  void (T8) + guarded delete (T9). Backend half of the spec fully covered;
  frontend + list-scaling explicitly deferred to follow-up plans.
- **Placeholder scan:** none — every code step shows full code; migration numbers
  are intentionally left to `makemigrations` (environment-assigned).
- **Type consistency:** `rename_event_slug(event, old_slug)`, `GuestWriteSerializer`,
  `GuestDetailView`/`GuestVoidView`, audit actions `event.updated`/`event.deleted`/
  `guest.updated`/`guest.voided`/`guest.deleted` used consistently across tasks.
