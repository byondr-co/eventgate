from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.permissions import HasOrgRole, IsOrgMember
from apps.orgs.models import Organization, OrganizationMembership
from apps.orgs.serializers import (
    InviteCreateSerializer,
    InviteSerializer,
    MembershipSerializer,
    OrganizationSerializer,
)
from apps.orgs.services import (
    InviteAlreadyMember,
    InviteEmailMismatch,
    InviteError,
    accept_invite,
    send_invite,
)


class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class _MembershipForSlug(IsOrgMember):
    """Adapter: ViewSet uses `lookup_field=slug`, IsOrgMember expects `org_slug`."""

    def has_permission(self, request: Request, view) -> bool:
        view.kwargs["org_slug"] = view.kwargs.get("slug")
        return super().has_permission(request, view)


class OrganizationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    list   GET    /api/v1/orgs/
    create POST   /api/v1/orgs/
    detail GET    /api/v1/orgs/<slug>/
    """

    serializer_class = OrganizationSerializer
    pagination_class = StandardPagination
    lookup_field = "slug"

    def get_permissions(self):
        if self.action in ("list", "create"):
            return [IsAuthenticated()]
        return [IsAuthenticated(), _MembershipForSlug()]

    def get_queryset(self):
        return Organization.objects.filter(
            memberships__user=self.request.user, memberships__is_active=True
        ).distinct()

    @transaction.atomic
    def perform_create(self, serializer):
        org = Organization.objects.create_with_unique_slug(name=serializer.validated_data["name"])
        OrganizationMembership.objects.create(
            user=self.request.user,
            organization=org,
            role="owner",
            accepted_at=timezone.now(),
        )
        serializer.instance = org


class OrgInviteCreateView(viewsets.GenericViewSet, mixins.CreateModelMixin):
    """POST /api/v1/orgs/<slug>/invites/"""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")
    serializer_class = InviteCreateSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            invite = send_invite(
                organization=request.organization,
                email=ser.validated_data["email"],
                role=ser.validated_data["role"],
                invited_by=request.user,
            )
        except InviteAlreadyMember:
            return Response(
                {"detail": "This email is already a member of the organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(InviteSerializer(invite).data, status=status.HTTP_201_CREATED)


class OrgMembersListView(viewsets.GenericViewSet, mixins.ListModelMixin):
    """GET /api/v1/orgs/<slug>/members/"""

    permission_classes = (IsAuthenticated, IsOrgMember)
    pagination_class = StandardPagination
    serializer_class = MembershipSerializer

    def get_queryset(self):
        return OrganizationMembership.objects.filter(
            organization=self.request.organization, is_active=True
        ).select_related("user")


class AcceptInviteView(viewsets.GenericViewSet):
    """POST /api/v1/auth/invites/<token>/accept/"""

    permission_classes = (IsAuthenticated,)

    def create(self, request: Request, token: str | None = None) -> Response:
        try:
            membership = accept_invite(raw_token=token or "", user=request.user)
        except InviteEmailMismatch as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except InviteError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "organization": OrganizationSerializer(
                    membership.organization, context={"request": request}
                ).data,
                "role": membership.role,
            },
            status=status.HTTP_200_OK,
        )
