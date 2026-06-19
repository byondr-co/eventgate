from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import AuditEvent
from apps.events.models import Event, RegistrationField
from apps.events.services import seed_preset_fields
from apps.guests.models import Guest
from apps.integrations.models import GoogleFormBridge, GoogleFormSubmission
from apps.integrations.services import process_google_form_submission
from apps.orgs.models import Organization, OrganizationMembership


def _create_setup():
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


@pytest.fixture
def setup(db):
    return _create_setup()


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

    with TestCase.captureOnCommitCallbacks(execute=True) as callbacks:
        result = process_google_form_submission(bridge=bridge, payload=_payload())
        mock_delay.assert_not_called()

    guest = Guest.objects.get(event=event, email="alice@example.com")
    assert result["status"] == "accepted"
    assert result["guest_id"] == str(guest.id)
    assert guest.full_name == "Alice"
    assert guest.phone_or_chat == "+85512345678"
    assert guest.custom_fields == {"company": "The Click Cam"}
    assert guest.source == "google_form_bridge"
    assert len(callbacks) == 1
    mock_delay.assert_called_once_with(guest_id=str(guest.id))
    assert GoogleFormSubmission.objects.get(bridge=bridge).guest == guest
    audit = AuditEvent.objects.get(action="integration.google_form_guest_created")
    audit.full_clean()
    assert audit.actor_type == "integration"
    assert audit.actor_id == str(bridge.id)


class GoogleFormBridgeOnCommitTests(TestCase):
    @patch("apps.guests.tasks.send_qr_email_task.delay")
    def test_bridge_created_guest_queues_qr_email_on_commit(self, mock_delay):
        org, user, event, bridge, raw_secret = _create_setup()

        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            result = process_google_form_submission(bridge=bridge, payload=_payload())
            guest = Guest.objects.get(event=event, email="alice@example.com")

            assert result["status"] == "accepted"
            assert result["guest_id"] == str(guest.id)
            mock_delay.assert_not_called()

        assert len(callbacks) == 1
        mock_delay.assert_called_once_with(guest_id=str(guest.id))


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_process_submission_is_idempotent_by_submission_id(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup

    with TestCase.captureOnCommitCallbacks(execute=True) as callbacks:
        first = process_google_form_submission(bridge=bridge, payload=_payload())
        second = process_google_form_submission(bridge=bridge, payload=_payload())
        mock_delay.assert_not_called()

    assert first["status"] == "accepted"
    assert second["status"] == "accepted"
    assert Guest.objects.filter(event=event, email="alice@example.com").count() == 1
    assert len(callbacks) == 1
    mock_delay.assert_called_once()
    assert GoogleFormSubmission.objects.filter(bridge=bridge, submission_id="row-2").count() == 1


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
@patch("apps.integrations.services.advisory_xact_lock")
def test_duplicate_email_processing_acquires_advisory_lock_for_normalized_email(
    mock_lock,
    mock_delay,
    setup,
):
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
        payload=_payload(submission_id="row-lock", email="ALICE@EXAMPLE.COM", name="Alice New"),
    )

    assert result["status"] == "updated"
    assert result["guest_id"] == str(existing.id)
    mock_lock.assert_called_once_with(
        f"google-form-bridge:{bridge.event_id}:email:alice@example.com"
    )
    mock_delay.assert_not_called()


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
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_submission_replay_with_changed_payload_is_rejected_without_mutation(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup
    first_payload = _payload()
    changed_payload = _payload(name="Alice Changed")

    with TestCase.captureOnCommitCallbacks(execute=True) as callbacks:
        first = process_google_form_submission(bridge=bridge, payload=first_payload)
        guest = Guest.objects.get(event=event, email="alice@example.com")
        result = process_google_form_submission(bridge=bridge, payload=changed_payload)
        mock_delay.assert_not_called()

    guest.refresh_from_db()
    submission = GoogleFormSubmission.objects.get(bridge=bridge, submission_id="row-2")

    assert first["status"] == "accepted"
    assert result == {
        "status": "rejected",
        "detail": "Submission replay payload does not match original payload.",
    }
    assert guest.full_name == "Alice"
    assert guest.phone_or_chat == "+85512345678"
    assert guest.custom_fields == {"company": "The Click Cam"}
    assert submission.status == "accepted"
    assert submission.guest == guest
    assert submission.error == ""
    assert submission.received_payload == first_payload
    assert GoogleFormSubmission.objects.filter(bridge=bridge, submission_id="row-2").count() == 1
    assert len(callbacks) == 1
    mock_delay.assert_called_once_with(guest_id=str(guest.id))
    assert AuditEvent.objects.filter(action="integration.google_form_guest_created").count() == 1
    assert (
        AuditEvent.objects.filter(action="integration.google_form_submission_rejected").count() == 1
    )


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_duplicate_policy_reject_duplicates_rejects_existing_email(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup
    bridge.duplicate_policy = "reject_duplicates"
    bridge.save(update_fields=["duplicate_policy"])
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

    result = process_google_form_submission(
        bridge=bridge,
        payload=_payload(submission_id="row-reject-duplicate"),
    )

    submission = GoogleFormSubmission.objects.get(
        bridge=bridge,
        submission_id="row-reject-duplicate",
    )
    assert result == {
        "status": "rejected",
        "detail": "Duplicate: email already registered for this event.",
    }
    assert submission.status == "rejected"
    assert submission.guest_id is None
    mock_delay.assert_not_called()
    assert (
        AuditEvent.objects.filter(action="integration.google_form_submission_rejected").count() == 1
    )


@pytest.mark.django_db
def test_submission_save_validation_error_is_persisted_as_rejection(setup):
    org, user, event, bridge, raw_secret = setup
    other_event = Event.objects.create(
        organization=org,
        name="Other Launch",
        slug="other-launch",
        registration_open=True,
    )
    wrong_event_guest = Guest.objects.create(
        organization=org,
        event=other_event,
        guest_type="pre_registered",
        entry_token="wrong-event-token",
        entry_status="registered_not_arrived",
        info_status="info_completed",
        full_name="Wrong Event",
        email="wrong@example.com",
        phone_or_chat="",
        custom_fields={},
        source="public_form",
    )

    with patch("apps.integrations.services.register_guest", return_value=wrong_event_guest):
        result = process_google_form_submission(
            bridge=bridge,
            payload=_payload(submission_id="row-save-validation"),
        )

    submission = GoogleFormSubmission.objects.get(
        bridge=bridge,
        submission_id="row-save-validation",
    )
    assert result["status"] == "rejected"
    assert "Google Form submission guest must belong" in result["detail"]
    assert submission.status == "rejected"
    assert submission.guest_id is None
    assert (
        AuditEvent.objects.filter(action="integration.google_form_submission_rejected").count() == 1
    )


@pytest.mark.django_db
def test_unrelated_validation_error_is_not_converted_to_submission_rejection(setup):
    org, user, event, bridge, raw_secret = setup

    with (
        patch(
            "apps.integrations.services.map_google_fields",
            side_effect=ValidationError("unexpected validation bug"),
        ),
        pytest.raises(ValidationError),
    ):
        process_google_form_submission(
            bridge=bridge,
            payload=_payload(submission_id="row-unrelated-validation"),
        )

    assert (
        GoogleFormSubmission.objects.filter(
            bridge=bridge,
            submission_id="row-unrelated-validation",
        ).count()
        == 0
    )
    assert (
        AuditEvent.objects.filter(action="integration.google_form_submission_rejected").count() == 0
    )


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
    assert (
        AuditEvent.objects.filter(action="integration.google_form_submission_rejected").count() == 1
    )


@pytest.mark.django_db
def test_non_object_fields_with_submission_id_is_rejected_and_audited(setup):
    org, user, event, bridge, raw_secret = setup
    payload = _payload(submission_id="row-6")
    payload["fields"] = ["not", "an", "object"]

    result = process_google_form_submission(bridge=bridge, payload=payload)

    assert result == {"status": "rejected", "detail": "fields must be an object."}
    assert Guest.objects.filter(event=event).count() == 0
    sub = GoogleFormSubmission.objects.get(bridge=bridge, submission_id="row-6")
    assert sub.status == "rejected"
    assert sub.received_payload == payload
    assert sub.error == "fields must be an object."
    assert sub.processed_at is not None
    assert (
        AuditEvent.objects.filter(action="integration.google_form_submission_rejected").count() == 1
    )


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
    assert GoogleFormSubmission.objects.filter(bridge=bridge).count() == 0
    mock_delay.assert_not_called()


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_webhook_rejects_non_object_payload_without_guest_mutation(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup
    client = APIClient()

    resp = client.post(
        f"/api/v1/integrations/google-forms/{bridge.id}/submissions/",
        data=["not", "an", "object"],
        format="json",
        HTTP_X_EVENTGATE_BRIDGE_SECRET=raw_secret,
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Payload must be a JSON object."
    assert Guest.objects.filter(event=event).count() == 0
    assert GoogleFormSubmission.objects.filter(bridge=bridge).count() == 0
    mock_delay.assert_not_called()


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_webhook_accepts_right_secret_and_returns_guest_id(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup
    client = APIClient()

    with TestCase.captureOnCommitCallbacks(execute=True) as callbacks:
        resp = client.post(
            f"/api/v1/integrations/google-forms/{bridge.id}/submissions/",
            data=_payload(),
            format="json",
            HTTP_X_EVENTGATE_BRIDGE_SECRET=raw_secret,
        )
        mock_delay.assert_not_called()

    assert resp.status_code == 201, resp.json()
    assert resp.json()["status"] == "accepted"
    guest = Guest.objects.get(event=event, email="alice@example.com")
    assert resp.json()["guest_id"] == str(guest.id)
    assert len(callbacks) == 1
    mock_delay.assert_called_once_with(guest_id=str(guest.id))


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_webhook_repeated_accepted_submission_returns_200_without_reenqueue(
    mock_delay,
    setup,
):
    org, user, event, bridge, raw_secret = setup
    client = APIClient()
    url = f"/api/v1/integrations/google-forms/{bridge.id}/submissions/"

    with TestCase.captureOnCommitCallbacks(execute=True) as callbacks:
        first = client.post(
            url,
            data=_payload(),
            format="json",
            HTTP_X_EVENTGATE_BRIDGE_SECRET=raw_secret,
        )
        second = client.post(
            url,
            data=_payload(),
            format="json",
            HTTP_X_EVENTGATE_BRIDGE_SECRET=raw_secret,
        )
        mock_delay.assert_not_called()

    assert first.status_code == 201, first.json()
    assert second.status_code == 200, second.json()
    assert second.json()["status"] == "accepted"
    assert Guest.objects.filter(event=event, email="alice@example.com").count() == 1
    assert GoogleFormSubmission.objects.filter(bridge=bridge, submission_id="row-2").count() == 1
    assert len(callbacks) == 1
    mock_delay.assert_called_once()


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_webhook_records_seen_labels(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup

    process_google_form_submission(
        bridge=bridge,
        payload=_payload(submission_id="row-seen-labels"),
    )
    bridge.refresh_from_db()

    assert "Full Name" in bridge.seen_labels
    assert "Email" in bridge.seen_labels
    assert "Phone" in bridge.seen_labels
    assert "Company" in bridge.seen_labels
    assert bridge.seen_labels == sorted(bridge.seen_labels)


@pytest.mark.django_db
@patch("apps.guests.tasks.send_qr_email_task.delay")
def test_webhook_replay_mismatch_returns_rejected_without_guest_mutation(mock_delay, setup):
    org, user, event, bridge, raw_secret = setup
    client = APIClient()
    url = f"/api/v1/integrations/google-forms/{bridge.id}/submissions/"

    with TestCase.captureOnCommitCallbacks(execute=True) as callbacks:
        first = client.post(
            url,
            data=_payload(),
            format="json",
            HTTP_X_EVENTGATE_BRIDGE_SECRET=raw_secret,
        )
        replay = client.post(
            url,
            data=_payload(name="Alice Changed"),
            format="json",
            HTTP_X_EVENTGATE_BRIDGE_SECRET=raw_secret,
        )
        mock_delay.assert_not_called()

    guest = Guest.objects.get(event=event, email="alice@example.com")
    assert first.status_code == 201, first.json()
    assert replay.status_code == 200, replay.json()
    assert replay.json() == {
        "status": "rejected",
        "detail": "Submission replay payload does not match original payload.",
    }
    assert guest.full_name == "Alice"
    assert len(callbacks) == 1
    mock_delay.assert_called_once_with(guest_id=str(guest.id))
