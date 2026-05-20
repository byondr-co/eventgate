"""Postgres advisory-lock helper.

`pg_advisory_xact_lock(hashtext(key))` is the production serialization point
for token mutations (check-in, walk-in claim). The lock is held until the
enclosing transaction commits/rolls back, so always call inside an atomic
block. SQLite test paths get a no-op so unit tests don't hard-depend on PG.
"""

from __future__ import annotations

from django.db import connection


def advisory_xact_lock(key: str) -> None:
    """Acquire a transaction-scoped advisory lock keyed by hashtext(key)."""
    if connection.vendor != "postgresql":
        # Test paths (sqlite) or other backends: best-effort no-op.
        return
    with connection.cursor() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [key])
