from __future__ import annotations

from datetime import datetime, time

from django.conf import settings
from django.db.models import F
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.views.decorators.http import require_GET
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.permissions import IsOrgMember
from apps.events.models import Event
from apps.shorturls.models import ShortUrl
from apps.shorturls.services import generate_short_code


def _parse_expires_at(value: object) -> datetime | None:
    """Accept None, ISO datetime, or date-only (YYYY-MM-DD) strings."""
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if timezone.is_aware(value) else timezone.make_aware(value)
    if isinstance(value, str):
        dt = parse_datetime(value)
        if dt is not None:
            return dt if timezone.is_aware(dt) else timezone.make_aware(dt)
        d = parse_date(value)
        if d is not None:
            return timezone.make_aware(datetime.combine(d, time.min))
    raise ValidationError({"expires_at": ["Enter a valid date (YYYY-MM-DD) or ISO 8601 datetime."]})


@require_GET
def redirect_short_url(request: HttpRequest, short_code: str) -> HttpResponse:
    su = get_object_or_404(ShortUrl, short_code=short_code)
    if not su.is_active:
        return HttpResponse("Not found", status=404)
    if su.expires_at and su.expires_at < timezone.now():
        return HttpResponse("Expired", status=404)
    ShortUrl.objects.filter(pk=su.pk).update(visit_count=F("visit_count") + 1)
    sep = "&" if "?" in su.target_url else "?"
    return redirect(f"{su.target_url}{sep}ref={su.short_code}")


def _serialize(s: ShortUrl) -> dict:
    return {
        "id": str(s.id),
        "short_code": s.short_code,
        "target_url": s.target_url,
        "note": s.note,
        "visit_count": s.visit_count,
        "is_active": s.is_active,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        "created_at": s.created_at.isoformat(),
    }


class EventShortUrlListView(viewsets.GenericViewSet, mixins.ListModelMixin):
    """GET/POST /api/v1/orgs/<slug>/events/<eventSlug>/short-urls/"""

    permission_classes = (IsAuthenticated, IsOrgMember)

    def _event(self, request, event_slug):
        return get_object_or_404(Event, organization=request.organization, slug=event_slug)

    def list(self, request, org_slug=None, event_slug=None):
        event = self._event(request, event_slug)
        qs = ShortUrl.objects.filter(event=event).order_by("-created_at")
        return Response({"count": qs.count(), "results": [_serialize(s) for s in qs]})

    def create(self, request, org_slug=None, event_slug=None):
        event = self._event(request, event_slug)
        target = f"{getattr(settings, 'PUBLIC_BASE_URL', '')}/e/{org_slug}/{event_slug}/register"
        su = ShortUrl.objects.create(
            short_code=generate_short_code(),
            target_url=target,
            event=event,
            note=request.data.get("note", ""),
            expires_at=_parse_expires_at(request.data.get("expires_at")),
        )
        return Response(_serialize(su), status=status.HTTP_201_CREATED)


class EventShortUrlDetailView(viewsets.GenericViewSet):
    """PATCH /api/v1/orgs/<slug>/events/<eventSlug>/short-urls/<id>/"""

    permission_classes = (IsAuthenticated, IsOrgMember)

    def partial_update(self, request, org_slug=None, event_slug=None, pk=None):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        su = get_object_or_404(ShortUrl, id=pk, event=event)
        if "note" in request.data:
            su.note = request.data["note"]
        if "expires_at" in request.data:
            su.expires_at = _parse_expires_at(request.data["expires_at"])
        if "is_active" in request.data:
            su.is_active = bool(request.data["is_active"])
        su.save(update_fields=["note", "expires_at", "is_active"])
        return Response(_serialize(su))
