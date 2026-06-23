from __future__ import annotations

from typing import ClassVar

from django.db import connection
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

_VERSION = "0.1.0"


class LivenessView(APIView):
    """Liveness probe — process-up check only, NO database query.

    This is the path the Fly health check hits every 30s. It deliberately does
    not touch Postgres: a per-30s `SELECT 1` kept Neon's compute permanently
    awake (its 5-min autosuspend never fired), billing idle compute-hours. With
    no DB query here, Neon can suspend during idle periods. Use HealthcheckView
    (/api/health/) when database reachability must be reported.
    """

    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = []

    def get(self, request: Request) -> Response:
        return Response({"status": "ok", "version": _VERSION})


class HealthcheckView(APIView):
    """Liveness + database-reachability probe.

    Returns 200 with database status, never raises on DB error — instead reports
    `database: "error"` so the endpoint stays available for load balancers. This
    hits the DB, so it is NOT used by the Fly health loop (see LivenessView); it
    backs the on-demand /debug/health page in the frontend.
    """

    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = []

    def get(self, request: Request) -> Response:
        try:
            with connection.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            db_status = "ok"
        except Exception:
            db_status = "error"
        return Response({"status": "ok", "version": _VERSION, "database": db_status})
