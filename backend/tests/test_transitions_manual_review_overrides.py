"""Plan F adds help-desk overrides from manual_review → checked_in / voided."""

from __future__ import annotations

import pytest

from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.transitions import apply_entry_transition, can_transition_entry
from apps.orgs.models import Organization


@pytest.fixture
def manual_review_guest(db) -> Guest:
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    return Guest.objects.create(
        organization=org,
        event=event,
        guest_type="pre_registered",
        full_name="X",
        entry_status="manual_review",
        entry_token="m1",
    )


def test_manual_review_to_checked_in_is_allowed(manual_review_guest):
    assert can_transition_entry(manual_review_guest, to="checked_in") is True
    g = apply_entry_transition(manual_review_guest, to="checked_in")
    assert g.entry_status == "checked_in"
    assert g.checked_in_at is not None


def test_manual_review_to_voided_is_allowed(manual_review_guest):
    assert can_transition_entry(manual_review_guest, to="voided") is True
    g = apply_entry_transition(manual_review_guest, to="voided")
    assert g.entry_status == "voided"


def test_walkin_manual_review_to_voided(db):
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    g = Guest.objects.create(
        organization=org,
        event=event,
        guest_type="walk_in",
        full_name="W",
        entry_status="manual_review",
        entry_token="w1",
    )
    g = apply_entry_transition(g, to="voided")
    assert g.entry_status == "voided"
