from django.urls import path

from apps.shorturls.views import EventShortUrlDetailView, EventShortUrlListView

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/short-urls/",
        EventShortUrlListView.as_view({"get": "list", "post": "create"}),
        name="event-short-urls",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/short-urls/<uuid:pk>/",
        EventShortUrlDetailView.as_view({"patch": "partial_update"}),
        name="event-short-url-detail",
    ),
]
