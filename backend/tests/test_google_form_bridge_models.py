import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.accounts.models import User
from apps.common.tokens import tokens_match
from apps.events.models import Event
from apps.events.services import seed_preset_fields
from apps.guests.models import Guest
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
    assert bridge.name == "Click Cam Google Form"
    assert bridge.field_mapping == {"Full Name": "name", "Email": "email"}
    assert bridge.enabled is False
    assert bridge.secret_hash != raw_secret
    assert tokens_match(raw_secret, bridge.secret_hash)
    assert bridge.check_secret(raw_secret) is True
    assert bridge.check_secret("wrong") is False


@pytest.mark.django_db
def test_rotate_secret_replaces_hash_and_returns_new_raw_secret(setup):
    _, user, event = setup
    bridge, old_secret = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    new_secret = bridge.rotate_secret()
    bridge.refresh_from_db()

    assert new_secret != old_secret
    assert bridge.check_secret(old_secret) is False
    assert bridge.check_secret(new_secret) is True


@pytest.mark.django_db
def test_submission_id_is_unique_per_bridge(setup):
    _, user, event = setup
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)
    GoogleFormSubmission.objects.create(
        bridge=bridge,
        event=event,
        submission_id="row-2",
        status="accepted",
        payload_hash="abc",
        received_payload={"fields": {"Email": "a@example.com"}},
    )

    with pytest.raises(IntegrityError):
        GoogleFormSubmission.objects.create(
            bridge=bridge,
            event=event,
            submission_id="row-2",
            status="accepted",
            payload_hash="def",
            received_payload={"fields": {"Email": "b@example.com"}},
        )


@pytest.mark.django_db
def test_submission_id_can_repeat_on_different_bridges(setup):
    _, user, event = setup
    first_bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)
    second_bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    GoogleFormSubmission.objects.create(
        bridge=first_bridge,
        event=event,
        submission_id="row-2",
        status="accepted",
        payload_hash="abc",
        received_payload={"fields": {"Email": "a@example.com"}},
    )
    second_submission = GoogleFormSubmission.objects.create(
        bridge=second_bridge,
        event=event,
        submission_id="row-2",
        status="accepted",
        payload_hash="def",
        received_payload={"fields": {"Email": "b@example.com"}},
    )

    assert second_submission.submission_id == "row-2"
    assert second_submission.bridge == second_bridge


@pytest.mark.django_db
def test_bridge_save_overwrites_organization_from_event(setup):
    org, user, event = setup
    wrong_org = Organization.objects.create(name="Wrong", slug="wrong")

    bridge = GoogleFormBridge.objects.create(
        organization=wrong_org,
        event=event,
        created_by=user,
        secret_hash="x",
    )
    bridge.refresh_from_db()

    assert bridge.organization == org


@pytest.mark.django_db
def test_submission_save_overwrites_event_and_organization_from_bridge(setup):
    org, user, event = setup
    wrong_org = Organization.objects.create(name="Wrong", slug="wrong")
    wrong_event = Event.objects.create(
        organization=wrong_org,
        name="Wrong",
        slug="wrong",
        registration_open=True,
    )
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    sub = GoogleFormSubmission.objects.create(
        organization=wrong_org,
        bridge=bridge,
        event=wrong_event,
        submission_id="row-3",
        status="accepted",
        payload_hash="abc",
        received_payload={"fields": {}},
    )
    sub.refresh_from_db()

    assert sub.organization == org
    assert sub.event == event


@pytest.mark.django_db
def test_submission_rejects_guest_from_another_event_or_org(setup):
    _, user, event = setup
    other_org = Organization.objects.create(name="Other", slug="other")
    other_event = Event.objects.create(
        organization=other_org,
        name="Other",
        slug="other",
        registration_open=True,
    )
    other_guest = Guest.objects.create(
        organization=other_org,
        event=other_event,
        guest_type="pre_registered",
        entry_token="other-token",
        full_name="Other Guest",
        email="other@example.com",
    )
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=user)

    with pytest.raises(ValidationError, match="same event and organization"):
        GoogleFormSubmission.objects.create(
            bridge=bridge,
            guest=other_guest,
            submission_id="row-4",
            status="accepted",
            payload_hash="abc",
            received_payload={"fields": {}},
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
