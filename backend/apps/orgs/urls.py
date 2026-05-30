from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.orgs.views import (
    AcceptInviteView,
    OrganizationViewSet,
    OrgInviteCreateView,
    OrgInviteDetailView,
    OrgMembershipDetailView,
    OrgMembersListView,
)

router = SimpleRouter(trailing_slash=True)
router.register("orgs", OrganizationViewSet, basename="orgs")

urlpatterns = [
    *router.urls,
    path(
        "orgs/<slug:org_slug>/invites/",
        OrgInviteCreateView.as_view({"get": "list", "post": "create"}),
        name="org-invites",
    ),
    path(
        "orgs/<slug:org_slug>/invites/<uuid:invite_id>/",
        OrgInviteDetailView.as_view({"delete": "destroy"}),
        name="org-invite-detail",
    ),
    path(
        "orgs/<slug:org_slug>/members/",
        OrgMembersListView.as_view({"get": "list"}),
        name="org-members-list",
    ),
    path(
        "orgs/<slug:org_slug>/memberships/<uuid:membership_id>/",
        OrgMembershipDetailView.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="org-membership-detail",
    ),
    path(
        "auth/invites/<str:token>/accept/",
        AcceptInviteView.as_view({"post": "create"}),
        name="invite-accept",
    ),
]
