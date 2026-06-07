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
