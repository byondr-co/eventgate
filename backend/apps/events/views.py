from __future__ import annotations

from django.db import transaction
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.events.models import Event, RegistrationField
from apps.events.serializers import EventSerializer, RegistrationFieldSerializer
from apps.events.services import seed_preset_fields
from apps.orgs.views import StandardPagination


class EventViewSet(viewsets.ModelViewSet):
    """CRUD for events under /api/v1/orgs/<slug:org_slug>/events/."""

    serializer_class = EventSerializer
    pagination_class = StandardPagination
    lookup_field = "slug"
    lookup_value_regex = "[a-z0-9-]+"

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            self.required_org_roles = ("owner", "admin", "manager")
            return [IsAuthenticated(), IsOrgMember(), HasOrgRole()]
        return [IsAuthenticated(), IsOrgMember()]

    def get_queryset(self):
        return Event.objects.filter(organization=self.request.organization)

    @transaction.atomic
    def perform_create(self, serializer):
        event = serializer.save(organization=self.request.organization)
        seed_preset_fields(event)


class RegistrationFieldViewSet(viewsets.ModelViewSet):
    """CRUD for an event's registration fields.

    URL: /api/v1/orgs/<org_slug>/events/<event_slug>/fields/
    """

    serializer_class = RegistrationFieldSerializer
    pagination_class = StandardPagination
    lookup_field = "field_key"

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            self.required_org_roles = ("owner", "admin", "manager")
            return [IsAuthenticated(), IsOrgMember(), HasOrgRole()]
        return [IsAuthenticated(), IsOrgMember()]

    def get_queryset(self):
        return RegistrationField.objects.filter(
            event__organization=self.request.organization,
            event__slug=self.kwargs["event_slug"],
        )

    def perform_create(self, serializer):
        event = Event.objects.get(
            organization=self.request.organization, slug=self.kwargs["event_slug"]
        )
        serializer.save(event=event)

    def perform_destroy(self, instance):
        if instance.is_preset:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Preset fields cannot be deleted.")
        instance.delete()
