from __future__ import annotations

from typing import ClassVar

from django.db import connection
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthcheckView(APIView):
    """Liveness + database-reachability probe.

    Returns 200 with database status, never raises on DB error — instead reports
    `database: "error"` so the endpoint stays available for load balancers.
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
        return Response({"status": "ok", "version": "0.1.0", "database": db_status})
