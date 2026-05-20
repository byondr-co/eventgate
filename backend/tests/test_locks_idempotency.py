import pytest
from django.core.cache import cache
from django.db import connection, transaction

from apps.common.idempotency import already_seen, remember
from apps.common.locks import advisory_xact_lock

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _clear_cache():
    """The locmem cache persists across tests within a pytest process. These
    tests assert "first call" semantics — anything another test wrote earlier
    under the same key would poison them. Clear in/out for guaranteed isolation.
    """
    cache.clear()
    yield
    cache.clear()


def test_advisory_lock_returns_within_txn():
    with transaction.atomic():
        advisory_xact_lock("token-abc")
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
            assert cur.fetchone() == (1,)


def test_idempotency_first_call_returns_false():
    assert already_seen("k1", scope="checkins") is False
    remember("k1", scope="checkins", value="ok")


def test_idempotency_second_call_returns_stored_payload():
    assert already_seen("k2", scope="checkins") is False
    remember("k2", scope="checkins", value={"status": "ok"})
    assert already_seen("k2", scope="checkins") == {"status": "ok"}


def test_idempotency_scopes_are_isolated():
    remember("k3", scope="checkins", value="x")
    assert already_seen("k3", scope="walkins") is False
