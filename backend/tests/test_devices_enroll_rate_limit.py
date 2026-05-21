"""POST /api/v1/devices/enroll/ — per-IP rate limit.

Defense in depth alongside single-use enrollment codes. Cap is generous
(10/min) — operator typing in an enrollment code by hand should never hit it.
"""

from __future__ import annotations

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_enroll_rate_limit_kicks_in_at_11th_request():
    c = APIClient(REMOTE_ADDR="10.0.0.1")
    last = None
    for _ in range(10):
        last = c.post("/api/v1/devices/enroll/", {"enrollment_code": "bad"}, format="json")
        assert last.status_code == 404, last.status_code
    blocked = c.post("/api/v1/devices/enroll/", {"enrollment_code": "bad"}, format="json")
    assert blocked.status_code == 429, blocked.status_code


@pytest.mark.django_db
def test_enroll_rate_limit_is_per_ip():
    c1 = APIClient(REMOTE_ADDR="10.0.0.1")
    c2 = APIClient(REMOTE_ADDR="10.0.0.2")
    for _ in range(10):
        c1.post("/api/v1/devices/enroll/", {"enrollment_code": "bad"}, format="json")
    # c1 is at its limit, but c2 should still be allowed:
    r = c2.post("/api/v1/devices/enroll/", {"enrollment_code": "bad"}, format="json")
    assert r.status_code == 404
