from django.urls import path

from apps.guests.views import GuestListView, PublicRegistrationView

urlpatterns = [
    path(
        "e/<slug:org_slug>/<slug:event_slug>/register/",
        PublicRegistrationView.as_view(),
        name="public-registration",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/",
        GuestListView.as_view({"get": "list"}),
        name="guest-list",
    ),
]
