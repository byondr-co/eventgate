import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.integrations.models import GoogleFormBridge
from apps.integrations.services import preview_google_form_submission
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


def bridge_detected_fields_url(org: Organization, event: Event, bridge: GoogleFormBridge) -> str:
    return f"{bridge_detail_url(org, event, bridge)}detected-fields/"


@pytest.fixture
def bridge_with_labels(db):
    def _factory(labels: list[str]):
        org = Organization.objects.create(name="LabelOrg", slug="labelorg")
        user = User.objects.create_user(email="owner@labelorg.com", password="x")
        OrganizationMembership.objects.create(organization=org, user=user, role="owner")
        event = Event.objects.create(
            organization=org,
            name="LabelEvent",
            slug="labelevent",
            registration_open=True,
        )
        from apps.events.services import seed_preset_fields

        seed_preset_fields(event)
        bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)
        bridge.seen_labels = labels
        bridge.save(update_fields=["seen_labels"])
        return org, event, bridge, user

    return _factory


@pytest.fixture
def api_client_owner():
    from rest_framework.test import APIClient as _APIClient

    client = _APIClient()

    def _authenticate(user):
        client.force_authenticate(user=user)
        return client

    return _authenticate


@pytest.mark.django_db
def test_detected_fields_returns_labels_and_suggestions(bridge_with_labels, api_client_owner):
    org, event, bridge, user = bridge_with_labels(["Email Address", "Full Name", "Mobile"])
    client = api_client_owner(user)
    url = bridge_detected_fields_url(org, event, bridge)
    resp = client.get(url)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["seen_labels"]) == {"Email Address", "Full Name", "Mobile"}
    assert body["suggestions"]["Email Address"] == "email"
    assert body["suggestions"]["Full Name"] == "name"
    assert body["suggestions"]["Mobile"] == "phone_or_chat"


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


@pytest.fixture
def make_org_event_bridge(db):
    def _factory(enabled: bool = False, test_mode: bool = False, field_mapping: dict | None = None):
        org = Organization.objects.create(name="PollOrg", slug="pollorg")
        user = User.objects.create_user(email="owner@pollorg.com", password="x")
        OrganizationMembership.objects.create(organization=org, user=user, role="owner")
        event = Event.objects.create(
            organization=org,
            name="PollEvent",
            slug="pollevent",
            registration_open=True,
        )
        seed_preset_fields(event)
        bridge, _ = GoogleFormBridge.create_with_secret(
            event=event,
            created_by=user,
            field_mapping=field_mapping or {},
        )
        bridge.enabled = enabled
        bridge.test_mode = test_mode
        bridge.save(update_fields=["enabled", "test_mode"])
        return org, event, bridge, user

    return _factory


@pytest.fixture
def post_submission():
    def _post(bridge: GoogleFormBridge, payload: dict):
        return preview_google_form_submission(bridge=bridge, payload=payload)

    return _post


def bridge_test_submission_url(org: Organization, event: Event, bridge: GoogleFormBridge) -> str:
    return f"{bridge_detail_url(org, event, bridge)}test-submission/"


@pytest.mark.django_db
def test_test_submission_poll(make_org_event_bridge, post_submission, api_client_owner):
    org, event, bridge, user = make_org_event_bridge(
        enabled=False,
        test_mode=True,
        field_mapping={"Email Address": "email", "Full Name": "name"},
    )
    client = api_client_owner(user)
    url = bridge_test_submission_url(org, event, bridge)

    assert client.get(url).status_code == 204  # none yet

    post_submission(
        bridge,
        {
            "submission_id": "t1",
            "fields": {"Email Address": ["a@x.com"], "Full Name": ["Ana"]},
        },
    )
    resp = client.get(url)
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"
    assert resp.json()["mapped"] == {"email": "a@x.com", "name": "Ana"}


@pytest.mark.django_db
def test_patch_can_toggle_test_mode(api_client_owner, make_org_event_bridge):
    org, event, bridge, user = make_org_event_bridge(enabled=False, test_mode=False)
    client = api_client_owner(user)
    url = (
        f"/api/v1/orgs/{org.slug}/events/{event.slug}"
        f"/integrations/google-form-bridge/{bridge.id}/"
    )
    resp = client.patch(url, {"test_mode": True}, format="json")
    assert resp.status_code == 200
    assert resp.json()["test_mode"] is True
    assert "seen_labels" in resp.json()


@pytest.mark.django_db
def test_seen_labels_is_read_only(api_client_owner, make_org_event_bridge):
    org, event, bridge, user = make_org_event_bridge(enabled=False, test_mode=False)
    bridge.seen_labels = ["Existing Label"]
    bridge.save(update_fields=["seen_labels"])
    client = api_client_owner(user)
    url = (
        f"/api/v1/orgs/{org.slug}/events/{event.slug}"
        f"/integrations/google-form-bridge/{bridge.id}/"
    )
    resp = client.patch(url, {"seen_labels": ["Injected Label"]}, format="json")
    assert resp.status_code == 200
    assert resp.json()["seen_labels"] == ["Existing Label"]
