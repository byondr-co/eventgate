from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.orgs.models import Organization, OrganizationMembership

pytestmark = pytest.mark.django_db
User = get_user_model()


def _make_user(email: str):
    return User.objects.create_user(email=email)


def _make_org(name: str, owner, role: str = "owner"):
    org = Organization.objects.create_with_unique_slug(name=name)
    OrganizationMembership.objects.create(user=owner, organization=org, role=role)
    return org


def _make_tiny_png() -> bytes:
    """Return a minimal 1x1 red PNG as bytes (no external deps)."""
    import base64

    # A valid 1x1 red pixel PNG (67 bytes), base64-encoded.
    b64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
        "z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
    )
    return base64.b64decode(b64)


def test_patch_description_persists():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    event = Event.objects.create(organization=org, name="E", slug="e")
    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.patch(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/",
        {"description": "Doors at 7pm."},
        format="json",
    )
    assert r.status_code == 200, r.content
    event.refresh_from_db()
    assert event.description == "Doors at 7pm."


def test_public_detail_exposes_description_and_null_banner():
    owner = _make_user("o@x.com")
    org = _make_org("O", owner)
    Event.objects.create(organization=org, name="E", slug="e", description="Welcome")
    c = APIClient()
    r = c.get(f"/api/v1/e/{org.slug}/e/")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["description"] == "Welcome"
    assert body["banner_image"] is None


# ---------------------------------------------------------------------------
# New tests for the dedicated multipart banner-upload endpoint (Plan L / S2)
# ---------------------------------------------------------------------------


def test_banner_upload_sets_banner_image():
    """Authorized manager can POST a banner image; endpoint saves it and returns
    an updated event payload with banner_image populated."""
    owner = _make_user("owner@x.com")
    org = _make_org("Org", owner)
    event = Event.objects.create(organization=org, name="Ev", slug="ev")

    img = SimpleUploadedFile("banner.png", _make_tiny_png(), content_type="image/png")

    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/banner/",
        {"banner_image": img},
        format="multipart",
    )

    assert r.status_code == 200, r.content
    body = r.json()
    assert body["banner_image"] is not None
    assert "banner" in body["banner_image"]  # URL contains the upload path

    event.refresh_from_db()
    assert bool(event.banner_image)


def test_banner_upload_requires_auth():
    """Anonymous request is rejected (401/403/404)."""
    owner = _make_user("owner2@x.com")
    org = _make_org("Org2", owner)
    event = Event.objects.create(organization=org, name="Ev2", slug="ev2")

    img = SimpleUploadedFile("b.png", _make_tiny_png(), content_type="image/png")

    c = APIClient()
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/banner/",
        {"banner_image": img},
        format="multipart",
    )
    assert r.status_code in (401, 403, 404)


def test_banner_upload_requires_manager_role():
    """A plain 'viewer' member cannot upload a banner."""
    owner = _make_user("owner3@x.com")
    viewer = _make_user("viewer@x.com")
    org = _make_org("Org3", owner)
    OrganizationMembership.objects.create(user=viewer, organization=org, role="viewer")
    event = Event.objects.create(organization=org, name="Ev3", slug="ev3")

    img = SimpleUploadedFile("b.png", _make_tiny_png(), content_type="image/png")

    c = APIClient()
    c.force_authenticate(user=viewer)
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/banner/",
        {"banner_image": img},
        format="multipart",
    )
    assert r.status_code in (403, 404)


def test_banner_upload_missing_file_returns_400():
    """Posting without a file returns 400."""
    owner = _make_user("owner4@x.com")
    org = _make_org("Org4", owner)
    event = Event.objects.create(organization=org, name="Ev4", slug="ev4")

    c = APIClient()
    c.force_authenticate(user=owner)
    r = c.post(
        f"/api/v1/orgs/{org.slug}/events/{event.slug}/banner/",
        {},
        format="multipart",
    )
    assert r.status_code == 400
