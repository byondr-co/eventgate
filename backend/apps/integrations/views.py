from __future__ import annotations

from typing import Any, ClassVar

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.events.models import Event
from apps.integrations.models import GoogleFormBridge, GoogleFormSubmission
from apps.integrations.serializers import (
    GoogleFormBridgeCreateSerializer,
    GoogleFormBridgeSerializer,
)
from apps.integrations.services import (
    GoogleFormBridgeError,
    process_google_form_submission,
    suggest_field_targets,
)
from apps.orgs.views import StandardPagination


def _submission_id_from_payload(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    return str(payload.get("submission_id") or "").strip()


class GoogleFormBridgeListCreateView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")
    pagination_class = StandardPagination

    def get_event(self, request: Request, event_slug: str) -> Event:
        return get_object_or_404(Event, organization=request.organization, slug=event_slug)

    def get(self, request: Request, org_slug: str, event_slug: str) -> Response:
        event = self.get_event(request, event_slug)
        bridges = GoogleFormBridge.objects.filter(event=event).order_by("-created_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(bridges, request, view=self)
        serializer = GoogleFormBridgeSerializer(
            page if page is not None else bridges,
            many=True,
            context={"request": request, "event": event},
        )
        if page is not None:
            return paginator.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def post(self, request: Request, org_slug: str, event_slug: str) -> Response:
        event = self.get_event(request, event_slug)
        serializer = GoogleFormBridgeCreateSerializer(
            data=request.data,
            context={"request": request, "event": event},
        )
        serializer.is_valid(raise_exception=True)

        bridge, raw_secret = GoogleFormBridge.create_with_secret(
            event=event,
            created_by=request.user,
            name=serializer.validated_data.get("name", "Google Form"),
            field_mapping=serializer.validated_data.get("field_mapping", {}),
            duplicate_policy=serializer.validated_data.get(
                "duplicate_policy",
                "upsert_by_email",
            ),
        )
        bridge.enabled = serializer.validated_data.get("enabled", False)
        bridge.save(update_fields=["enabled"])

        body = GoogleFormBridgeCreateSerializer(
            bridge,
            context={"request": request, "event": event},
        ).data
        body["secret"] = raw_secret
        return Response(body, status=status.HTTP_201_CREATED)


class GoogleFormBridgeDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def get_bridge(
        self,
        request: Request,
        event_slug: str,
        bridge_id: Any,
    ) -> tuple[Event, GoogleFormBridge]:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        bridge = get_object_or_404(GoogleFormBridge, id=bridge_id, event=event)
        return event, bridge

    def get(self, request: Request, org_slug: str, event_slug: str, bridge_id: Any) -> Response:
        event, bridge = self.get_bridge(request, event_slug, bridge_id)
        return Response(
            GoogleFormBridgeSerializer(
                bridge,
                context={"request": request, "event": event},
            ).data
        )

    def patch(self, request: Request, org_slug: str, event_slug: str, bridge_id: Any) -> Response:
        event, bridge = self.get_bridge(request, event_slug, bridge_id)
        serializer = GoogleFormBridgeSerializer(
            bridge,
            data=request.data,
            partial=True,
            context={"request": request, "event": event},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class GoogleFormBridgeRotateSecretView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def post(self, request: Request, org_slug: str, event_slug: str, bridge_id: Any) -> Response:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        bridge = get_object_or_404(GoogleFormBridge, id=bridge_id, event=event)
        raw_secret = bridge.rotate_secret()
        body = GoogleFormBridgeCreateSerializer(
            bridge,
            context={"request": request, "event": event},
        ).data
        body["secret"] = raw_secret
        return Response(body)


class GoogleFormBridgeDetectedFieldsView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def get(self, request: Request, org_slug: str, event_slug: str, bridge_id: Any) -> Response:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        bridge = get_object_or_404(GoogleFormBridge, id=bridge_id, event=event)
        return Response(
            {"seen_labels": bridge.seen_labels or [], "suggestions": suggest_field_targets(bridge)}
        )


class GoogleFormSubmissionWebhookView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes: ClassVar[list] = []

    def post(self, request: Request, bridge_id: Any) -> Response:
        bridge = get_object_or_404(
            GoogleFormBridge.objects.select_related("event__organization"),
            id=bridge_id,
        )
        raw_secret = request.headers.get("X-Eventgate-Bridge-Secret", "")
        if not bridge.check_secret(raw_secret):
            return Response(
                {"detail": "Invalid bridge secret."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not isinstance(request.data, dict):
            return Response(
                {"detail": "Payload must be a JSON object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        submission_id = _submission_id_from_payload(request.data)
        was_processed = bool(
            submission_id
            and GoogleFormSubmission.objects.filter(
                bridge=bridge,
                submission_id=submission_id,
                processed_at__isnull=False,
            ).exists()
        )
        try:
            result = process_google_form_submission(bridge=bridge, payload=request.data)
        except GoogleFormBridgeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        response_status = (
            status.HTTP_201_CREATED
            if result.get("status") == "accepted" and not was_processed
            else status.HTTP_200_OK
        )
        return Response(result, status=response_status)
