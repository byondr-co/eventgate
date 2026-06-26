from __future__ import annotations

from typing import ClassVar

from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import write_audit
from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.events.models import Event, EventSlugAlias, RegistrationField
from apps.events.serializers import (
    EventSerializer,
    EventTransitionSerializer,
    RegistrationFieldSerializer,
)
from apps.events.services import (
    PinTooShort,
    rename_event_slug,
    seed_preset_fields,
    set_event_pin,
    transition_event,
)
from apps.orgs.views import StandardPagination


class EventViewSet(viewsets.ModelViewSet):
    """CRUD for events under /api/v1/orgs/<slug:org_slug>/events/."""

    serializer_class = EventSerializer
    pagination_class = StandardPagination
    lookup_field = "slug"
    lookup_value_regex = "[a-z0-9-]+"

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "transition"):
            self.required_org_roles = ("owner", "admin", "manager")
            return [IsAuthenticated(), IsOrgMember(), HasOrgRole()]
        return [IsAuthenticated(), IsOrgMember()]

    def get_queryset(self):
        return Event.objects.filter(organization=self.request.organization)

    @transaction.atomic
    def perform_create(self, serializer):
        event = serializer.save(organization=self.request.organization)
        seed_preset_fields(event)

    @transaction.atomic
    def perform_update(self, serializer):
        old_slug = serializer.instance.slug
        event = serializer.save()
        if event.slug != old_slug:
            rename_event_slug(event, old_slug)
            write_audit(
                organization=event.organization,
                event=event,
                actor_type="user",
                actor_id=str(self.request.user.id),
                action="event.updated",
                result="success",
                details={"slug_changed": {"from": old_slug, "to": event.slug}},
            )

    @action(detail=True, methods=["post"], url_path="transition")
    def transition(self, request, org_slug=None, slug=None):
        """POST /api/v1/orgs/<org_slug>/events/<event_slug>/transition/

        Body: {"status": "<target>"}
        Role-gated via ``get_permissions()`` (owner/admin/manager).
        """
        event = get_object_or_404(Event, organization=request.organization, slug=slug)
        serializer = EventTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = transition_event(event, serializer.validated_data["status"])
        return Response(EventSerializer(updated).data)


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

    # Plan K item #9 — preset fields are now deletable; UI warns the operator.


class EventPinView(APIView):
    """POST /api/v1/orgs/<org_slug>/events/<slug>/pin/{set,rotate}/

    Owner/admin only. `set` and `rotate` share semantics — the second URL is a
    clearer name for the recurring case.
    """

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin")

    def post(self, request, org_slug, slug, action):
        event = get_object_or_404(Event, organization=request.organization, slug=slug)
        pin = (request.data.get("pin") or "").strip()
        try:
            set_event_pin(event, pin)
        except PinTooShort as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response({"detail": "PIN updated.", "rotated_at": event.event_pin_rotated_at})


class EventBannerView(APIView):
    """POST /api/v1/orgs/<org_slug>/events/<event_slug>/banner/

    Accepts a multipart/form-data upload with a ``banner_image`` field.
    Saves the file to ``Event.banner_image`` (public_media_storage) and returns
    the updated event serialized with ``EventSerializer``.

    Requires owner/admin/manager role (same guard as event mutation actions).
    """

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")
    parser_classes: ClassVar = [MultiPartParser, FormParser]

    def post(self, request, org_slug: str, event_slug: str) -> Response:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        uploaded = request.FILES.get("banner_image")
        if uploaded is None:
            return Response({"detail": "Missing banner_image."}, status=status.HTTP_400_BAD_REQUEST)
        event.banner_image = uploaded
        event.save(update_fields=["banner_image"])
        return Response(EventSerializer(event, context={"request": request}).data)


class PublicEventDetailView(APIView):
    """GET /api/v1/e/<org_slug>/<event_slug>/  (anonymous)

    Returns just enough for the public registration / walk-in claim pages to
    render: event name + open status + EN/KM field labels. Sensitive columns
    (event_pin_hash) are explicitly excluded.
    """

    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def get(self, request, org_slug, event_slug):
        event = Event.objects.filter(organization__slug=org_slug, slug=event_slug).first()
        if event is None:
            alias = (
                EventSlugAlias.objects.filter(organization__slug=org_slug, slug=event_slug)
                .select_related("event")
                .first()
            )
            if alias is None:
                raise Http404
            event = alias.event
        fields = [
            {
                "field_key": f.field_key,
                "label_en": f.label_en,
                "label_km": f.label_km,
                "field_type": f.field_type,
                "required": f.required,
                "options": f.options_json or [],
                "order_index": f.order_index,
            }
            for f in event.registration_fields.order_by("order_index", "field_key")
        ]
        return Response(
            {
                "org_slug": org_slug,
                "slug": event.slug,
                "name": event.name,
                "venue": event.venue,
                "description": event.description,
                "banner_image": (
                    request.build_absolute_uri(event.banner_image.url)
                    if event.banner_image
                    else None
                ),
                "status": event.status,
                "starts_at": event.starts_at,
                "ends_at": event.ends_at,
                "timezone": event.timezone,
                "registration_open": event.registration_open,
                "walkins_enabled": event.walkins_enabled,
                "fields": fields,
            }
        )
