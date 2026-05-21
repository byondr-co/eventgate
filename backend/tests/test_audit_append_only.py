"""DB-level append-only enforcement on audit_auditevent.

Verifies the BEFORE UPDATE OR DELETE trigger raises an exception even when
the SQL is issued directly (bypassing the app's write_audit() guard).
"""

from __future__ import annotations

import pytest
from django.db import connection, transaction

from apps.audit.services import write_audit
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_direct_update_raises():
    org = Organization.objects.create(name="Acme", slug="acme")
    row = write_audit(
        organization=org,
        actor_type="system",
        actor_id="test",
        action="checkin.success",
        result="success",
    )
    with pytest.raises(Exception) as exc, transaction.atomic():
        with connection.cursor() as cur:
            cur.execute(
                "UPDATE audit_auditevent SET action = %s WHERE id = %s",
                ["tampered", str(row.id)],
            )
    # Either IntegrityError (from raise_exception in plpgsql) or generic DB error.
    assert "append-only" in str(exc.value).lower()


@pytest.mark.django_db
def test_direct_delete_raises():
    org = Organization.objects.create(name="Acme", slug="acme")
    row = write_audit(
        organization=org,
        actor_type="system",
        actor_id="test",
        action="checkin.success",
        result="success",
    )
    with pytest.raises(Exception) as exc, transaction.atomic():
        with connection.cursor() as cur:
            cur.execute("DELETE FROM audit_auditevent WHERE id = %s", [str(row.id)])
    assert "append-only" in str(exc.value).lower()


@pytest.mark.django_db
def test_insert_still_works():
    org = Organization.objects.create(name="Acme", slug="acme")
    row = write_audit(
        organization=org,
        actor_type="system",
        actor_id="test",
        action="checkin.success",
        result="success",
    )
    assert row.id is not None
