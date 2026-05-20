import pytest

from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.transitions import (
    InvalidTransition,
    apply_entry_transition,
    apply_info_transition,
    can_transition_entry,
)
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _guest(**kwargs):
    org = Organization.objects.create(
        name="O", slug=f"o-{Guest.objects.count()}-{Organization.objects.count()}"
    )
    ev = Event.objects.create(organization=org, name="E", slug="e")
    defaults = {
        "organization": org,
        "event": ev,
        "guest_type": "pre_registered",
        "entry_token": f"t-{Guest.objects.count()}",
        "entry_status": "registered_not_arrived",
        "info_status": "info_completed",
    }
    defaults.update(kwargs)
    return Guest.objects.create(**defaults)


def test_prereg_checkin_happy_path():
    g = _guest()
    assert can_transition_entry(g, to="checked_in")
    apply_entry_transition(g, to="checked_in")
    g.refresh_from_db()
    assert g.entry_status == "checked_in"
    assert g.checked_in_at is not None


def test_double_checkin_rejected():
    g = _guest(entry_status="checked_in")
    with pytest.raises(InvalidTransition):
        apply_entry_transition(g, to="checked_in")


def test_walkin_display_to_checked_in_sets_info_status():
    g = _guest(guest_type="walk_in", entry_status="displayed", info_status="info_completed")
    apply_entry_transition(g, to="checked_in", side_effects={"info_status": "claimed_pending_info"})
    g.refresh_from_db()
    assert g.entry_status == "checked_in"
    assert g.info_status == "claimed_pending_info"


def test_walkin_display_to_voided():
    g = _guest(guest_type="walk_in", entry_status="displayed")
    apply_entry_transition(g, to="voided")
    g.refresh_from_db()
    assert g.entry_status == "voided"


def test_info_completion():
    g = _guest(info_status="claimed_pending_info")
    apply_info_transition(g, to="info_completed")
    g.refresh_from_db()
    assert g.info_status == "info_completed"


def test_invalid_info_jump():
    g = _guest(info_status="info_completed")
    with pytest.raises(InvalidTransition):
        apply_info_transition(g, to="claimed_pending_info")


@pytest.mark.parametrize(
    "frm,to",
    [
        ("registered_not_arrived", "voided"),  # not in spec
        ("checked_in", "registered_not_arrived"),  # never reverse
        ("voided", "checked_in"),  # never re-check-in voided
    ],
)
def test_disallowed_entry_transitions(frm, to):
    g = _guest(entry_status=frm)
    assert not can_transition_entry(g, to=to)
    with pytest.raises(InvalidTransition):
        apply_entry_transition(g, to=to)
