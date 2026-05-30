from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_GET
from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.permissions import IsOrgMember
from apps.events.models import Event
from apps.shorturls.models import ShortUrl


@require_GET
def redirect_short_url(request: HttpRequest, short_code: str) -> HttpResponse:
    su = get_object_or_404(ShortUrl, short_code=short_code)
    if su.expires_at and su.expires_at < timezone.now():
        return HttpResponse("Expired", status=404)
    return redirect(su.target_url)


class EventShortUrlListView(viewsets.GenericViewSet, mixins.ListModelMixin):
    """GET /api/v1/orgs/<slug>/events/<eventSlug>/short-urls/"""

    permission_classes = (IsAuthenticated, IsOrgMember)

    def list(self, request, org_slug=None, event_slug=None):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        qs = ShortUrl.objects.filter(event=event).order_by("-created_at")
        results = [
            {
                "id": str(s.id),
                "short_code": s.short_code,
                "target_url": s.target_url,
                "created_at": s.created_at.isoformat(),
            }
            for s in qs
        ]
        return Response({"count": len(results), "results": results})
