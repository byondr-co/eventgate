from __future__ import annotations

import hashlib
from typing import ClassVar

from django.conf import settings
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsOrgMember
from apps.common.qr import render_png
from apps.common.tokens import hash_token, tokens_match
from apps.devices.auth import SessionTokenAuthentication
from apps.events.models import Event
from apps.guests.models import CsvImport, Guest
from apps.guests.serializers import (
    CsvImportSerializer,
    GuestSerializer,
    GuestSyncSerializer,
    RegistrationSubmitResponseSerializer,
)
from apps.guests.services import (
    MAX_CSV_BYTES,
    CsvParseError,
    EventNotOpen,
    RegistrationError,
    auto_detect,
    parse_csv_preview,
    register_guest,
)
from apps.guests.tasks import process_csv_import_task, send_qr_email_task
from apps.orgs.models import Organization
from apps.orgs.views import StandardPagination


class PublicRegistrationView(APIView):
    """POST /api/v1/e/<org_slug>/<event_slug>/register/

    Anonymous. Returns 201 with guest_id + entry_token (see serializer for security rationale).
    """

    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request: Request, org_slug: str, event_slug: str) -> Response:
        org = get_object_or_404(Organization, slug=org_slug)
        event = get_object_or_404(Event, organization=org, slug=event_slug)

        from apps.shorturls.models import ShortUrl

        ref = request.data.get("ref")
        referrer = (
            ShortUrl.objects.filter(event=event, short_code=ref, is_active=True).first()
            if ref
            else None
        )

        try:
            guest = register_guest(event=event, payload=request.data, referrer=referrer)
        except EventNotOpen as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except RegistrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        body = RegistrationSubmitResponseSerializer(
            {"guest_id": guest.id, "entry_token": guest.entry_token}
        ).data
        return Response(body, status=status.HTTP_201_CREATED)


class GuestListView(viewsets.GenericViewSet):
    """GET /api/v1/orgs/<org_slug>/events/<event_slug>/guests/ — staff list."""

    serializer_class = GuestSerializer
    pagination_class = StandardPagination
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get_queryset(self):
        qs = Guest.objects.filter(
            organization=self.request.organization,
            event__slug=self.kwargs["event_slug"],
        )
        entry_status = self.request.query_params.get("entry_status")
        if entry_status:
            qs = qs.filter(entry_status=entry_status)
        guest_type = self.request.query_params.get("guest_type")
        if guest_type:
            qs = qs.filter(guest_type=guest_type)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(full_name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone_or_chat__icontains=search)
            )
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        ser = self.get_serializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response(ser.data)


class GuestQrView(APIView):
    """GET /api/v1/guests/<id>/qr.png?token=<raw>

    Public endpoint requiring possession of the raw entry_token. Constant-time
    compare guards against timing attacks.
    """

    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def get(self, request: Request, guest_id) -> HttpResponse:
        provided = request.query_params.get("token", "")
        guest = get_object_or_404(Guest, id=guest_id)
        if not tokens_match(provided, hash_token(guest.entry_token)):
            return Response(
                {"detail": "Token does not match guest."}, status=status.HTTP_403_FORBIDDEN
            )
        png = render_png(guest.entry_token)
        resp = HttpResponse(png, content_type="image/png")
        resp["Cache-Control"] = "private, max-age=300"
        return resp


class GuestSyncView(APIView):
    """GET /api/v1/orgs/<org>/events/<event>/guests/sync/?since=<iso>

    Returns the minimal guest projection for this event, optionally filtered
    to rows changed at or after `since`. Authenticated by scanner session token.

    Response shape:
        {
            "guests": [GuestSyncSerializer, …],
            "cursor": "<iso8601>"   ← max updated_at across returned rows
        }

    The response carries an ETag of `sha1(cursor)`. Clients should resend
    that ETag as If-None-Match to get a 304 when nothing changed.
    """

    authentication_classes = (SessionTokenAuthentication,)
    permission_classes = (AllowAny,)  # session auth enforces it

    def get(self, request: Request, org_slug: str, event_slug: str) -> Response:
        device = getattr(request, "scanner_device", None)
        if not device:
            return Response({"detail": "Session token required."}, status=401)
        event = get_object_or_404(Event, organization=device.organization, slug=event_slug)
        if device.event_id != event.id:
            return Response({"detail": "Device not paired to this event."}, status=403)

        qs = event.guests.all()
        since_raw = request.query_params.get("since")
        if since_raw:
            since = parse_datetime(since_raw)
            if since is None:
                # Unencoded `+` in the query string arrives as a space; recover.
                since = parse_datetime(since_raw.replace(" ", "+"))
            if since is None:
                return Response({"detail": "Invalid 'since' parameter."}, status=400)
            qs = qs.filter(updated_at__gte=since)

        rows = list(qs.order_by("updated_at"))
        if rows:
            max_updated = max(r.updated_at for r in rows)
            cursor_iso = max_updated.isoformat()
        elif since_raw:
            cursor_iso = since_raw
        else:
            cursor_iso = ""
        etag = hashlib.sha1(cursor_iso.encode("utf-8")).hexdigest() if cursor_iso else "empty"

        if_none_match = request.META.get("HTTP_IF_NONE_MATCH")
        if if_none_match and if_none_match.strip('"') == etag:
            res = Response(status=304)
            res["ETag"] = etag
            return res

        body = {
            "guests": GuestSyncSerializer(rows, many=True).data,
            "cursor": cursor_iso,
        }
        res = Response(body)
        res["ETag"] = etag
        return res


class CsvImportPreviewView(APIView):
    """POST /api/v1/orgs/<org_slug>/events/<event_slug>/imports/preview/

    Multipart upload. Parses headers + first 5 data rows, returns an auto-mapping
    proposal and the event's `RegistrationField`s. Creates a `CsvImport` row
    with status="preview" so the client can later commit by referencing it.
    Enforces a 5 MB max upload size and requires UTF-8 + at least one data row.
    """

    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]
    parser_classes: ClassVar = [MultiPartParser]

    def post(self, request: Request, org_slug: str, event_slug: str) -> Response:
        event = get_object_or_404(Event, organization__slug=org_slug, slug=event_slug)

        uploaded = request.FILES.get("file")
        if uploaded is None:
            return Response({"detail": "Missing file."}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded.size > MAX_CSV_BYTES:
            return Response(
                {"detail": "File too large. Max 5 MB."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        raw = uploaded.read()
        try:
            headers, rows = parse_csv_preview(raw)
        except CsvParseError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        uploaded.seek(0)
        ci = CsvImport.objects.create(
            event=event,
            uploaded_by=request.user,
            file=uploaded,
            column_mapping={},
            status="preview",
        )

        registration_fields = [
            {"id": str(rf.id), "label": rf.label_en, "field_key": rf.field_key}
            for rf in event.registration_fields.exclude(
                field_key__in={"name", "email", "phone_or_chat"}
            )
        ]

        return Response(
            {
                "preview_id": str(ci.id),
                "headers": headers,
                "first_rows": rows,
                "auto_mapping": auto_detect(headers),
                "registration_fields": registration_fields,
            }
        )


class CsvImportStatusView(APIView):
    """GET /api/v1/orgs/<org_slug>/events/<event_slug>/imports/<import_id>/

    Progress + error-report URL for a CSV import job. Polled by the UI while
    the Celery task runs.
    """

    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]

    def get(self, request: Request, org_slug: str, event_slug: str, import_id) -> Response:
        event = get_object_or_404(Event, organization__slug=org_slug, slug=event_slug)
        ci = get_object_or_404(CsvImport, id=import_id, event=event)
        return Response(CsvImportSerializer(ci, context={"request": request}).data)


class CsvImportCommitView(APIView):
    """POST /api/v1/orgs/<org_slug>/events/<event_slug>/imports/

    Accepts {preview_id, column_mapping}. Transitions the existing preview-status
    CsvImport row to "pending" and enqueues the processing task. Returns 201.
    """

    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]

    def post(self, request: Request, org_slug: str, event_slug: str) -> Response:
        event = get_object_or_404(Event, organization__slug=org_slug, slug=event_slug)

        preview_id = request.data.get("preview_id")
        mapping = request.data.get("column_mapping", {})
        if not isinstance(mapping, dict):
            return Response(
                {"detail": "column_mapping must be an object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ci = get_object_or_404(CsvImport, id=preview_id, event=event)
        if ci.status != "preview":
            return Response(
                {"detail": f"Import is already in status '{ci.status}'."},
                status=status.HTTP_409_CONFLICT,
            )

        ci.column_mapping = mapping
        ci.status = "pending"
        ci.save(update_fields=["column_mapping", "status"])

        process_csv_import_task.delay(import_id=str(ci.id))

        return Response(
            {
                "import_id": str(ci.id),
                "status": ci.status,
                "total_rows": ci.total_rows,
            },
            status=status.HTTP_201_CREATED,
        )


class GuestSendQrEmailView(APIView):
    """POST /api/v1/orgs/<org>/events/<event>/guests/<id>/send-qr-email/"""

    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]

    def post(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = get_object_or_404(
            Guest, id=guest_id, organization=request.organization, event__slug=event_slug
        )
        if not guest.email:
            return Response(
                {"detail": "This guest has no email on file."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        send_qr_email_task.delay(guest_id=str(guest.id))
        return Response({"status": "queued"}, status=status.HTTP_202_ACCEPTED)


class GuestTelegramLinkView(APIView):
    """GET /api/v1/orgs/<org>/events/<event>/guests/<id>/telegram-link/"""

    permission_classes: ClassVar = [IsAuthenticated, IsOrgMember]

    def get(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = get_object_or_404(
            Guest, id=guest_id, organization=request.organization, event__slug=event_slug
        )
        bot = getattr(settings, "TELEGRAM_BOT_USERNAME", "")
        if not bot:
            return Response(
                {"detail": "Telegram bot is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"url": f"https://t.me/{bot}?start={guest.entry_token}"})
