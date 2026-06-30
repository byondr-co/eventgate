from __future__ import annotations

import csv as _csv
import hashlib
import io as _io
from typing import ClassVar

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import filters, status, viewsets
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import write_audit
from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.common.qr import render_png
from apps.common.tokens import hash_token, tokens_match
from apps.devices.auth import SessionTokenAuthentication
from apps.events.live_publish import schedule_event_changed
from apps.events.models import Event, RegistrationField
from apps.guests.models import CsvImport, Guest
from apps.guests.serializers import (
    CsvImportSerializer,
    GuestSerializer,
    GuestSyncSerializer,
    GuestWriteSerializer,
    RegistrationSubmitResponseSerializer,
)
from apps.guests.services import (
    MAX_CSV_BYTES,
    PRESET_FIELDS,
    CsvParseError,
    EventNotOpen,
    RegistrationError,
    auto_detect,
    filtered_event_guests,
    parse_csv_preview,
    register_guest,
)
from apps.guests.tasks import process_csv_import_task, send_qr_email_task
from apps.orgs.models import Organization
from apps.orgs.views import StandardPagination

_EXPORT_ORDERING = {"full_name", "email", "created_at", "entry_status", "checked_in_at"}


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


class GuestExportView(APIView):
    """POST /api/v1/orgs/<org>/events/<event>/guests/export/ — streamed CSV."""

    permission_classes = (IsAuthenticated, IsOrgMember)

    def post(self, request: Request, org_slug: str, event_slug: str) -> StreamingHttpResponse:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        body = request.data if isinstance(request.data, dict) else {}
        ids = body.get("ids")
        filters_body = body.get("filters") or {}

        if ids:
            qs = Guest.objects.filter(organization=request.organization, event=event, id__in=ids)
        else:
            qs = filtered_event_guests(
                organization=request.organization,
                event_slug=event_slug,
                search=filters_body.get("search", ""),
                entry_status=filters_body.get("entry_status", ""),
                guest_type=filters_body.get("guest_type", ""),
            )
        ordering = filters_body.get("ordering") or "-created_at"
        qs = qs.order_by(ordering if ordering.lstrip("-") in _EXPORT_ORDERING else "-created_at")

        reg_fields = list(
            RegistrationField.objects.filter(event=event)
            .exclude(field_key__in=PRESET_FIELDS)
            .order_by("order_index", "field_key")
        )
        header = (
            ["Name", "Email", "Phone/Chat"]
            + [f.label_en for f in reg_fields]
            + ["Type", "Entry status", "Checked in at", "Registered at"]
        )

        def stream():
            buf = _io.StringIO()
            writer = _csv.writer(buf)

            def flush():
                data = buf.getvalue()
                buf.seek(0)
                buf.truncate(0)
                return data

            writer.writerow(header)
            yield flush()
            for g in qs.iterator():
                cf = g.custom_fields or {}
                writer.writerow(
                    [g.full_name, g.email, g.phone_or_chat]
                    + [cf.get(f.field_key, "") for f in reg_fields]
                    + [
                        g.guest_type,
                        g.entry_status,
                        g.checked_in_at.isoformat() if g.checked_in_at else "",
                        g.created_at.isoformat() if g.created_at else "",
                    ]
                )
                yield flush()

        resp = StreamingHttpResponse(stream(), content_type="text/csv")
        resp["Content-Disposition"] = f'attachment; filename="{event_slug}-guests.csv"'
        return resp


class GuestListView(viewsets.GenericViewSet):
    """GET /api/v1/orgs/<org_slug>/events/<event_slug>/guests/ — staff list."""

    serializer_class = GuestSerializer
    pagination_class = StandardPagination
    permission_classes = (IsAuthenticated, IsOrgMember)
    filter_backends = (filters.OrderingFilter,)
    ordering_fields = ("full_name", "email", "created_at", "entry_status", "checked_in_at")

    def get_queryset(self):
        p = self.request.query_params
        return filtered_event_guests(
            organization=self.request.organization,
            event_slug=self.kwargs["event_slug"],
            search=p.get("search", ""),
            entry_status=p.get("entry_status", ""),
            guest_type=p.get("guest_type", ""),
        )

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


class GuestBulkView(APIView):
    """POST /api/v1/orgs/<org>/events/<event>/guests/bulk/ — apply one action to many guests."""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def post(self, request: Request, org_slug: str, event_slug: str) -> Response:
        from apps.audit.models import AuditEvent

        action = request.data.get("action")
        ids = request.data.get("guest_ids") or []
        if action not in ("void", "resend_qr", "delete"):
            return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)

        found = {
            str(g.id): g
            for g in Guest.objects.filter(
                organization=request.organization, event__slug=event_slug, id__in=ids
            )
        }
        done = 0
        skipped: list[dict] = []
        errors: list[dict] = []
        actor_id = str(request.user.id)
        publish_event_id = None

        for raw_id in ids:
            g = found.get(str(raw_id))
            if g is None:
                skipped.append({"id": str(raw_id), "reason": "not_found"})
                continue
            try:
                if action == "void":
                    previous = g.entry_status
                    if g.entry_status != "voided":
                        g.entry_status = "voided"
                        g.save(update_fields=["entry_status", "updated_at"])
                    write_audit(
                        organization=g.organization,
                        event=g.event,
                        guest=g,
                        actor_type="user",
                        actor_id=actor_id,
                        action="guest.voided",
                        result="success",
                        previous_status=previous,
                        new_status="voided",
                    )
                    publish_event_id = publish_event_id or g.event_id
                    done += 1
                elif action == "resend_qr":
                    if g.guest_type != "pre_registered":
                        skipped.append({"id": str(g.id), "reason": "walk_in"})
                        continue
                    if not g.email:
                        skipped.append({"id": str(g.id), "reason": "no_email"})
                        continue
                    send_qr_email_task.delay(guest_id=str(g.id))
                    publish_event_id = publish_event_id or g.event_id
                    done += 1
                else:  # delete
                    if AuditEvent.objects.filter(guest=g).exists():
                        skipped.append({"id": str(g.id), "reason": "has_history"})
                        continue
                    deleted_event_id = g.event_id
                    with transaction.atomic():
                        write_audit(
                            organization=g.organization,
                            event=g.event,
                            actor_type="user",
                            actor_id=actor_id,
                            action="guest.deleted",
                            result="success",
                            details={
                                "guest_id": str(g.id),
                                "full_name": g.full_name,
                                "email": g.email,
                            },
                        )
                        g.delete()
                    publish_event_id = publish_event_id or deleted_event_id
                    done += 1
            except Exception as exc:
                errors.append({"id": str(g.id), "error": str(exc)})

        if done > 0 and publish_event_id is not None:
            schedule_event_changed(
                event_id=publish_event_id,
                reason="guest.bulk_action",
                keys=("stats", "audit", "guests_count"),
            )

        return Response({"action": action, "done": done, "skipped": skipped, "errors": errors})


class GuestVoidView(APIView):
    """POST /api/v1/orgs/<org>/events/<event>/guests/<id>/void/ — soft-remove."""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def post(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = get_object_or_404(
            Guest, id=guest_id, organization=request.organization, event__slug=event_slug
        )
        previous = guest.entry_status
        if guest.entry_status != "voided":
            guest.entry_status = "voided"
            guest.save(update_fields=["entry_status", "updated_at"])
        write_audit(
            organization=guest.organization,
            event=guest.event,
            guest=guest,
            actor_type="user",
            actor_id=str(request.user.id),
            action="guest.voided",
            result="success",
            previous_status=previous,
            new_status="voided",
        )
        schedule_event_changed(
            event_id=guest.event_id,
            reason="guest.voided",
            keys=("stats", "audit", "guests_count"),
        )
        return Response(GuestWriteSerializer(guest).data)


class GuestDetailView(APIView):
    """GET/PATCH/DELETE a single guest.

    URL: /api/v1/orgs/<org>/events/<event>/guests/<guest_id>/
    """

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def _guest(self, request, event_slug, guest_id):
        return get_object_or_404(
            Guest, id=guest_id, organization=request.organization, event__slug=event_slug
        )

    def get(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = self._guest(request, event_slug, guest_id)
        return Response(GuestWriteSerializer(guest).data)

    def patch(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        guest = self._guest(request, event_slug, guest_id)
        ser = GuestWriteSerializer(guest, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        write_audit(
            organization=guest.organization,
            event=guest.event,
            guest=guest,
            actor_type="user",
            actor_id=str(request.user.id),
            action="guest.updated",
            result="success",
            details={"fields": sorted(request.data.keys())},
        )
        schedule_event_changed(
            event_id=guest.event_id,
            reason="guest.updated",
            keys=("stats", "audit", "guests_count"),
        )
        return Response(ser.data)

    @transaction.atomic
    def delete(self, request: Request, org_slug: str, event_slug: str, guest_id) -> Response:
        from apps.audit.models import AuditEvent

        guest = self._guest(request, event_slug, guest_id)
        if AuditEvent.objects.filter(guest=guest).exists():
            return Response(
                {"detail": "This guest has activity history. Void them instead of deleting."},
                status=status.HTTP_409_CONFLICT,
            )
        write_audit(
            organization=guest.organization,
            event=guest.event,
            actor_type="user",
            actor_id=str(request.user.id),
            action="guest.deleted",
            result="success",
            details={
                "guest_id": str(guest.id),
                "full_name": guest.full_name,
                "email": guest.email,
            },
        )
        schedule_event_changed(
            event_id=guest.event_id,
            reason="guest.deleted",
            keys=("stats", "audit", "guests_count"),
        )
        guest.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
