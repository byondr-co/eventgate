"""Throttles scoped to the device enrollment path.

Single-use enrollment codes already prevent replay; this caps the rate of
*attempts* against the endpoint per IP.
"""

from __future__ import annotations

from rest_framework.throttling import SimpleRateThrottle


class DeviceEnrollIPThrottle(SimpleRateThrottle):
    scope = "device_enroll"
    rate = "10/min"

    def get_cache_key(self, request, view) -> str:
        ip = self.get_ident(request)
        return f"throttle:{self.scope}:{ip}"
