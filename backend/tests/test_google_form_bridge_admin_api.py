import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.integrations.models import GoogleFormBridge
from apps.orgs.models import Organization, OrganizationMembership


def bridge_list_url(org: Organization, event: Event) -> str:
    return f"/api/v1/orgs/{org.slug}/events/{event.slug}/integrations/google-form-bridge/"


def bridge_detail_url(org: Organization, event: Event, bridge: GoogleFormBridge) -> str:
    return f"{bridge_list_url(org, event)}{bridge.id}/"


def bridge_rotate_url(org: Organization, event: Event, bridge: GoogleFormBridge) -> str:
    return f"{bridge_detail_url(org, event, bridge)}rotate-secret/"


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


def complete_mapping() -> dict[str, str]:
    return {
        "Full Name": "name",
        "Email": "email",
        "Phone": "phone_or_chat",
        "Company": "company",
    }


@pytest.mark.django_db
def test_create_bridge_returns_raw_secret_once(setup):
    client, org, user, event = setup
    resp = client.post(
        bridge_list_url(org, event),
        {
            "name": "Click Cam Form",
            "field_mapping": complete_mapping(),
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

    resp = client.get(bridge_list_url(org, event))

    assert resp.status_code == 200, resp.json()
    assert resp.json()["results"][0]["name"] == "Bridge"
    assert "secret" not in resp.json()["results"][0]
    assert "secret_hash" not in resp.json()["results"][0]


@pytest.mark.django_db
def test_update_rejects_unknown_mapping_target(setup):
    client, org, user, event = setup
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    resp = client.patch(
        bridge_detail_url(org, event, bridge),
        {"field_mapping": {"Full Name": "not_a_field"}},
        format="json",
    )

    assert resp.status_code == 400
    assert "not valid" in str(resp.json())


@pytest.mark.django_db
def test_create_rejects_enabled_bridge_missing_required_mapping(setup):
    client, org, user, event = setup

    resp = client.post(
        bridge_list_url(org, event),
        {
            "name": "Click Cam Form",
            "field_mapping": {"Full Name": "name", "Email": "email"},
            "enabled": True,
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "required" in str(resp.json()).lower()
    assert not GoogleFormBridge.objects.filter(event=event).exists()


@pytest.mark.django_db
def test_update_rejects_enabling_bridge_missing_required_mapping(setup):
    client, org, user, event = setup
    bridge, _ = GoogleFormBridge.create_with_secret(
        event=event,
        created_by=user,
        field_mapping={"Full Name": "name", "Email": "email"},
    )

    resp = client.patch(
        bridge_detail_url(org, event, bridge),
        {"enabled": True},
        format="json",
    )

    assert resp.status_code == 400
    assert "required" in str(resp.json()).lower()
    bridge.refresh_from_db()
    assert bridge.enabled is False


@pytest.mark.django_db
def test_rotate_secret_returns_new_secret_once(setup):
    client, org, user, event = setup
    bridge, old_secret = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    resp = client.post(bridge_rotate_url(org, event, bridge))

    assert resp.status_code == 200, resp.json()
    new_secret = resp.json()["secret"]
    bridge.refresh_from_db()
    assert bridge.check_secret(new_secret)
    assert not bridge.check_secret(old_secret)


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["get", "post", "patch", "rotate"])
def test_admin_api_rejects_anonymous_users(setup, method):
    client, org, user, event = setup
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)
    anon = APIClient()

    resp = request_bridge_endpoint(anon, method, org, event, bridge)

    assert resp.status_code in (401, 403)


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["get", "post", "patch", "rotate"])
def test_admin_api_rejects_non_members(setup, method):
    client, org, user, event = setup
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)
    outsider = User.objects.create_user(email="outsider@example.com", password="x")
    outsider_client = APIClient()
    outsider_client.force_authenticate(user=outsider)

    resp = request_bridge_endpoint(outsider_client, method, org, event, bridge)

    assert resp.status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["get", "post", "patch", "rotate"])
def test_admin_api_rejects_staff_members(setup, method):
    client, org, user, event = setup
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)
    staff = User.objects.create_user(email="staff@example.com", password="x")
    OrganizationMembership.objects.create(organization=org, user=staff, role="staff")
    staff_client = APIClient()
    staff_client.force_authenticate(user=staff)

    resp = request_bridge_endpoint(staff_client, method, org, event, bridge)

    assert resp.status_code == 403


def request_bridge_endpoint(
    client: APIClient,
    method: str,
    org: Organization,
    event: Event,
    bridge: GoogleFormBridge,
):
    if method == "get":
        return client.get(bridge_list_url(org, event))
    if method == "post":
        return client.post(
            bridge_list_url(org, event),
            {"field_mapping": complete_mapping(), "enabled": True},
            format="json",
        )
    if method == "patch":
        return client.patch(
            bridge_detail_url(org, event, bridge),
            {"field_mapping": complete_mapping()},
            format="json",
        )
    return client.post(bridge_rotate_url(org, event, bridge))
