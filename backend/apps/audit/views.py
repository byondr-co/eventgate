from __future__ import annotations

import hashlib

from django.db.models import Count, Max
from django.http import HttpResponseNotModified
from django.shortcuts import get_object_or_404
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.audit.models import AuditEvent
from apps.audit.serializers import AuditEventSerializer
from apps.common.permissions import IsOrgMember
from apps.events.models import Event


class _Pagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500


class AuditListView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        qs = AuditEvent.objects.filter(event=event)

        action_prefix = request.query_params.get("action_prefix")
        if action_prefix:
            qs = qs.filter(action__startswith=action_prefix)

        # NOTE: Postgres has no MAX(uuid). Use Count("id") as a row-count proxy
        # alongside Max("occurred_at") so the ETag changes whenever a row is
        # added (occurred_at advances) or removed (count drops).
        agg = qs.aggregate(latest=Max("occurred_at"), n=Count("id"))
        raw = f"{agg.get('latest')}-{agg.get('n')}-{action_prefix or 'all'}"
        etag = f'W/"{hashlib.sha256(raw.encode()).hexdigest()[:16]}"'
        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            return HttpResponseNotModified()

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs.order_by("-occurred_at"), request, view=self)
        ser = AuditEventSerializer(page, many=True)
        resp = paginator.get_paginated_response(ser.data)
        resp["ETag"] = etag
        return resp
