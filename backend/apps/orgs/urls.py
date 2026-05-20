from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.orgs.views import AcceptInviteView, OrganizationViewSet, OrgInviteCreateView

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
        "auth/invites/<str:token>/accept/",
        AcceptInviteView.as_view({"post": "create"}),
        name="invite-accept",
    ),
]
