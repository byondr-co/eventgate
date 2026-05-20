from __future__ import annotations

from typing import ClassVar

from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsOrgMember
from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.serializers import GuestSerializer, RegistrationSubmitResponseSerializer
from apps.guests.services import EventNotOpen, RegistrationError, register_guest
from apps.orgs.models import Organization
from apps.orgs.views import StandardPagination


class PublicRegistrationView(APIView):
    """POST /api/v1/e/<org_slug>/<event_slug>/register/

    Anonymous. Returns 201 with guest_id only (raw token never echoed).
    """

    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request: Request, org_slug: str, event_slug: str) -> Response:
        org = get_object_or_404(Organization, slug=org_slug)
        event = get_object_or_404(Event, organization=org, slug=event_slug)
        try:
            guest = register_guest(event=event, payload=request.data)
        except EventNotOpen as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except RegistrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        body = RegistrationSubmitResponseSerializer({"guest_id": guest.id}).data
        return Response(body, status=status.HTTP_201_CREATED)


class GuestListView(viewsets.GenericViewSet):
    """GET /api/v1/orgs/<org_slug>/events/<event_slug>/guests/ — staff list."""

    serializer_class = GuestSerializer
    pagination_class = StandardPagination
    permission_classes = (IsAuthenticated, IsOrgMember)

    def get_queryset(self):
        return Guest.objects.filter(
            organization=self.request.organization,
            event__slug=self.kwargs["event_slug"],
        )

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        ser = self.get_serializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response(ser.data)
