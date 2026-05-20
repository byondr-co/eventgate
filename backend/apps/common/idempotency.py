"""Idempotency-key store backed by Django's cache.

Each scanner check-in carries a `client_idempotency_key`. The first time we
see one, we run the mutation and `remember()` the response payload under
`idem:<scope>:<key>` with a 24h TTL. Subsequent calls return the stored
payload via `already_seen()` instead of re-running the mutation.

In production the cache is Redis; tests use locmem. Both satisfy the same
get/set contract.
"""

from __future__ import annotations

import json
from typing import Any

from django.core.cache import cache

TTL_SECONDS = 24 * 60 * 60


def _full(scope: str, key: str) -> str:
    return f"idem:{scope}:{key}"


def already_seen(key: str, *, scope: str) -> Any:
    """Return the previously-stored payload, or False if never seen.

    Note: False (a falsy boolean) is the sentinel for "first call". A
    previously-stored payload of literal False is unsupported by design —
    payloads are dicts in practice.
    """
    raw = cache.get(_full(scope, key))
    if raw is None:
        return False
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return raw


def remember(key: str, *, scope: str, value: Any) -> None:
    cache.set(_full(scope, key), json.dumps(value, default=str), timeout=TTL_SECONDS)
