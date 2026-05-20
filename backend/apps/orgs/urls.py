from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.orgs.views import (
    AcceptInviteView,
    OrganizationViewSet,
    OrgInviteCreateView,
    OrgMembersListView,
)

router = SimpleRouter(trailing_slash=True)
router.register("orgs", OrganizationViewSet, basename="orgs")

urlpatterns = [
    *router.urls,
    path(
        "orgs/<slug:org_slug>/invites/",
        OrgInviteCreateView.as_view({"post": "create"}),
        name="org-invite-create",
    ),
    path(
        "orgs/<slug:org_slug>/members/",
        OrgMembersListView.as_view({"get": "list"}),
        name="org-members-list",
    ),
    path(
        "auth/invites/<str:token>/accept/",
        AcceptInviteView.as_view({"post": "create"}),
        name="invite-accept",
    ),
]
