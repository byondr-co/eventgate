from __future__ import annotations

import hashlib

from django.db.models import Max
from django.http import HttpResponseNotModified
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsOrgMember
from apps.events.models import Event
from apps.helpdesk.models import HelpDeskTicketState
from apps.helpdesk.serializers import HelpDeskTicketStateSerializer
from apps.helpdesk.services import claim_ticket, release_ticket, resolve_ticket


class _Pagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class HelpDeskTicketListView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get(self, request, org_slug, event_slug):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        qs = HelpDeskTicketState.objects.filter(event=event).select_related(
            "audit_event", "assigned_to"
        )

        status_filter = request.query_params.get("status")
        if status_filter in {"open", "claimed", "resolved"}:
            qs = qs.filter(claim_status=status_filter)
        elif status_filter == "open_or_claimed":
            qs = qs.filter(claim_status__in=("open", "claimed"))

        agg = qs.aggregate(latest=Max("updated_at"), maxid=Max("id"))
        raw = f"{agg.get('latest')}-{agg.get('maxid')}-{status_filter or 'all'}"
        etag = f'W/"{hashlib.sha256(raw.encode()).hexdigest()[:16]}"'

        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            return HttpResponseNotModified()

        paginator = _Pagination()
        page = paginator.paginate_queryset(qs.order_by("-created_at"), request, view=self)
        ser = HelpDeskTicketStateSerializer(page, many=True)
        resp = paginator.get_paginated_response(ser.data)
        resp["ETag"] = etag
        return resp


class _TicketActionMixin:
    permission_classes = (IsAuthenticated, IsOrgMember)

    def _ticket(self, request, event_slug, ticket_id) -> HelpDeskTicketState:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        return get_object_or_404(HelpDeskTicketState, id=ticket_id, event=event)


class HelpDeskTicketClaimView(_TicketActionMixin, APIView):
    def post(self, request, org_slug, event_slug, ticket_id):
        ticket = self._ticket(request, event_slug, ticket_id)
        ticket = claim_ticket(ticket=ticket, user=request.user)
        return Response(HelpDeskTicketStateSerializer(ticket).data)


class HelpDeskTicketReleaseView(_TicketActionMixin, APIView):
    def post(self, request, org_slug, event_slug, ticket_id):
        ticket = self._ticket(request, event_slug, ticket_id)
        ticket = release_ticket(ticket=ticket, user=request.user)
        return Response(HelpDeskTicketStateSerializer(ticket).data)


class HelpDeskTicketResolveView(_TicketActionMixin, APIView):
    def post(self, request, org_slug, event_slug, ticket_id):
        ticket = self._ticket(request, event_slug, ticket_id)
        action = (request.data.get("action") or "").strip()
        notes = (request.data.get("notes") or "").strip()
        try:
            ticket = resolve_ticket(ticket=ticket, user=request.user, action=action, notes=notes)
        except ValueError as exc:
            raise ValidationError({"action": str(exc)}) from exc
        return Response(HelpDeskTicketStateSerializer(ticket).data)
