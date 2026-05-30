from django.urls import path

from apps.shorturls.views import EventShortUrlListView

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/short-urls/",
        EventShortUrlListView.as_view({"get": "list"}),
        name="event-short-urls",
    ),
]
