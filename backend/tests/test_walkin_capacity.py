"""Walk-in capacity enforcement.

`Event.walkin_capacity` is a hard cap on total non-voided walk-in guests.

  0  → unlimited (legacy behavior).
  N>0 → when COUNT(walk_in, not voided) >= N, the display-next API
        returns {"status": "full", walkin_count, walkin_capacity} with
        HTTP 200 (the tablet polls continuously, so 200+full is more
        polite than triggering error UI).

Below the cap, the success response is unchanged except that it now also
includes `walkin_count` and `walkin_capacity` so the tablet can render a
counter.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.devices.services import complete_enrollment, create_device, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.models import Guest
from apps.orgs.models import Organization

pytestmark = pytest.mark.django_db


def _display_session(capacity: int = 0):
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(
        organization=org,
        name="E",
        slug="e",
        walkin_capacity=capacity,
    )
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="W1", role="walkin_display")
    _, _ = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    return org, event, d, st


def _post_next(client: APIClient, gate: str = "G1", scanner_label: str = "S1"):
    return client.post(
        "/api/v1/walkins/displays/next/",
        {"gate": gate, "scanner_label": scanner_label},
        format="json",
    )


def test_capacity_zero_is_unlimited():
    """capacity=0 means unlimited — 10+ walk-ins can be issued without rejection."""
    _org, event, _d, st = _display_session(capacity=0)
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")

    for i in range(12):
        # Rotate scanner labels so each call mints a fresh `displayed` row
        # (one displayed per scope is enforced by the existing partial index).
        r = _post_next(c, gate="G1", scanner_label=f"S{i}")
        assert r.status_code == 200, r.data
        # Below-cap path always returns a usable claim URL.
        assert r.data.get("status") in (None, "ready"), r.data
        assert "entry_token" in r.data
        assert r.data.get("walkin_capacity") == 0
        # Each mint advances the count.
        assert r.data.get("walkin_count") == i + 1


def test_capacity_above_zero_below_cap_returns_ready_with_counts():
    """capacity=3, currently 0 walk-ins: issuing a display slot still works."""
    _org, event, _d, st = _display_session(capacity=3)
    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")

    r = _post_next(c)
    assert r.status_code == 200, r.data
    assert "entry_token" in r.data
    assert r.data["claim_url"].endswith(f"/claim/{r.data['entry_token']}/")
    assert r.data["walkin_capacity"] == 3
    assert r.data["walkin_count"] == 1


def test_capacity_full_returns_full_state_no_new_guest():
    """capacity=3, currently 3 walk-ins: returns full state, no new Guest row."""
    org, event, _d, st = _display_session(capacity=3)

    # Pre-fill 3 non-voided walk-ins. Use `checked_in` so they don't collide
    # with the partial unique index on `displayed` walk-ins per scope.
    for i in range(3):
        Guest.objects.create(
            organization=org,
            event=event,
            guest_type="walk_in",
            entry_token=f"prefilled-{i}",
            entry_status="checked_in",
            info_status="info_completed",
            source="walk_in_display",
        )

    before = Guest.objects.filter(event=event, guest_type="walk_in").count()
    assert before == 3

    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = _post_next(c)

    assert r.status_code == 200, r.data
    assert r.data == {"status": "full", "walkin_count": 3, "walkin_capacity": 3}

    after = Guest.objects.filter(event=event, guest_type="walk_in").count()
    assert after == 3, "Full state must NOT create a new Guest row"


def test_voided_walkins_do_not_count_toward_capacity():
    """Voided walk-ins are excluded from the cap (matches services semantics)."""
    org, event, _d, st = _display_session(capacity=2)

    # 2 voided + 0 active → still under cap of 2.
    for i in range(2):
        Guest.objects.create(
            organization=org,
            event=event,
            guest_type="walk_in",
            entry_token=f"voided-{i}",
            entry_status="voided",
            info_status="info_completed",
            source="walk_in_display",
        )

    c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
    r = _post_next(c)
    assert r.status_code == 200, r.data
    assert "entry_token" in r.data
    # Active walk-in count includes the just-minted `displayed` row (1).
    assert r.data["walkin_count"] == 1
    assert r.data["walkin_capacity"] == 2
