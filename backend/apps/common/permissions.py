"""Permission classes for tenant-scoped views.

Views resolved via URL `<slug:org_slug>` are passed through IsOrgMember which:
  1. Loads the Organization by slug (raises 404 if not found).
  2. Verifies the request user has an active membership in that org.
  3. Sets `request.organization` and `request.org_role` for downstream code.
  4. Returns 404 (not 403) on non-membership to avoid leaking org existence.
"""

from __future__ import annotations

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.orgs.models import Organization, OrganizationMembership


class IsOrgMember(BasePermission):
    message = "Membership required."

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        org_slug = view.kwargs.get("org_slug")
        if not org_slug:
            return False

        # 404 over the org so non-members never learn the org exists
        org = get_object_or_404(Organization, slug=org_slug)
        try:
            membership = OrganizationMembership.objects.get(
                organization=org, user=request.user, is_active=True
            )
        except OrganizationMembership.DoesNotExist as exc:
            raise Http404 from exc

        request.organization = org  # type: ignore[attr-defined]
        request.org_role = membership.role  # type: ignore[attr-defined]
        return True


class HasOrgRole(BasePermission):
    """Composable check: required_roles set on the view as `required_org_roles`."""

    def has_permission(self, request: Request, view) -> bool:
        required = getattr(view, "required_org_roles", None)
        if not required:
            return True
        return getattr(request, "org_role", None) in set(required)
