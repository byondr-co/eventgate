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
    MembershipUpdateSerializer,
    OrganizationSerializer,
)
from apps.orgs.services import (
    InviteAlreadyMember,
    InviteEmailMismatch,
    InviteError,
    accept_invite,
    cancel_invite,
    remove_membership,
    send_invite,
    update_membership_role,
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
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    list           GET    /api/v1/orgs/
    create         POST   /api/v1/orgs/
    detail         GET    /api/v1/orgs/<slug>/
    partial_update PATCH  /api/v1/orgs/<slug>/
    """

    serializer_class = OrganizationSerializer
    pagination_class = StandardPagination
    lookup_field = "slug"

    def get_permissions(self):
        if self.action in ("list", "create"):
            return [IsAuthenticated()]
        if self.action in ("update", "partial_update"):
            self.required_org_roles = ("owner", "admin")
            return [IsAuthenticated(), _MembershipForSlug(), HasOrgRole()]
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


class OrgInviteCreateView(viewsets.GenericViewSet, mixins.CreateModelMixin, mixins.ListModelMixin):
    """GET/POST /api/v1/orgs/<slug>/invites/"""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")
    pagination_class = StandardPagination

    def get_serializer_class(self):
        if self.action == "list":
            return InviteSerializer
        return InviteCreateSerializer

    def get_queryset(self):
        from apps.orgs.models import Invite

        return Invite.objects.filter(
            organization=self.request.organization,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
        ).order_by("-created_at")

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


class OrgMembershipDetailView(viewsets.GenericViewSet):
    """PATCH/DELETE /api/v1/orgs/<slug>/memberships/<membership_id>/"""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin")

    def _get_membership(self, request, membership_id: str) -> OrganizationMembership:
        from django.shortcuts import get_object_or_404

        return get_object_or_404(
            OrganizationMembership,
            id=membership_id,
            organization=request.organization,
            is_active=True,
        )

    def partial_update(self, request: Request, org_slug=None, membership_id=None) -> Response:
        ser = MembershipUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        membership = self._get_membership(request, membership_id)
        if membership.user_id == request.user.id:
            return Response(
                {"detail": "You cannot change your own role. Ask another owner/admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from rest_framework.exceptions import ValidationError as DRFValidationError

        try:
            update_membership_role(membership=membership, new_role=ser.validated_data["role"])
        except DRFValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(MembershipSerializer(membership).data)

    def destroy(self, request: Request, org_slug=None, membership_id=None) -> Response:
        membership = self._get_membership(request, membership_id)
        from rest_framework.exceptions import ValidationError as DRFValidationError

        try:
            remove_membership(membership=membership)
        except DRFValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrgInviteDetailView(viewsets.GenericViewSet):
    """DELETE /api/v1/orgs/<slug>/invites/<invite_id>/  (cancel a pending invite)"""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin")

    def destroy(self, request: Request, org_slug=None, invite_id=None) -> Response:
        from django.shortcuts import get_object_or_404
        from rest_framework.exceptions import ValidationError as DRFValidationError

        from apps.orgs.models import Invite

        invite = get_object_or_404(Invite, id=invite_id, organization=request.organization)
        try:
            cancel_invite(invite=invite)
        except DRFValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)
