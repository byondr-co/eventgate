"""Concurrent check-ins of the same token: exactly one wins.

Exercises advisory_xact_lock + InvalidTransition under 5 simultaneous
requests. Requires real Postgres (the lock is a no-op on SQLite).
"""

import threading

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.devices.services import complete_enrollment, create_device, unlock_with_pin
from apps.events.models import Event
from apps.events.services import set_event_pin
from apps.guests.services import register_guest
from apps.orgs.models import Organization


@pytest.mark.django_db(transaction=True)
def test_only_one_concurrent_checkin_wins():
    org = Organization.objects.create(name="O", slug="o")
    event = Event.objects.create(organization=org, name="E", slug="e")
    set_event_pin(event, "1234")
    d, code = create_device(organization=org, event=event, label="G1", role="scanner")
    _, _ = complete_enrollment(enrollment_code=code)
    d.refresh_from_db()
    _, st = unlock_with_pin(device=d, raw_pin="1234")
    g = register_guest(
        event=event,
        payload={"name": "A", "email": "a@x.com", "phone_or_chat": "1"},
    )

    results: list[int] = []
    lock = threading.Lock()

    def call(idx: int) -> None:
        c = APIClient(HTTP_AUTHORIZATION=f"Bearer {st}")
        r = c.post(
            "/api/v1/checkins/",
            {
                "token": g.entry_token,
                "gate": "G1",
                "scanner_label": f"L{idx}",
                "client_idempotency_key": f"key-{idx}",
            },
            format="json",
        )
        with lock:
            results.append(r.status_code)
        connection.close()

    threads = [threading.Thread(target=call, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    successes = [s for s in results if s == 200]
    duplicates = [s for s in results if s == 409]
    assert len(successes) == 1
    assert len(duplicates) == 4
