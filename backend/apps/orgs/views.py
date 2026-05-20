from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from apps.common.permissions import IsOrgMember
from apps.orgs.models import Organization, OrganizationMembership
from apps.orgs.serializers import OrganizationSerializer


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
