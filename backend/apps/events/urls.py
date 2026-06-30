from django.urls import path

from apps.events.views import (
    EventBannerView,
    EventPinView,
    EventViewSet,
    PublicEventDetailView,
    RegistrationFieldViewSet,
)
from apps.events.views_live import EventLiveView
from apps.events.views_stats import EventStatsView

event_list = EventViewSet.as_view({"get": "list", "post": "create"})
event_detail = EventViewSet.as_view(
    {
        "get": "retrieve",
        "patch": "partial_update",
        "put": "update",
        "delete": "destroy",
    }
)
event_transition = EventViewSet.as_view({"post": "transition"})
field_list = RegistrationFieldViewSet.as_view({"get": "list", "post": "create"})
field_detail = RegistrationFieldViewSet.as_view(
    {
        "get": "retrieve",
        "patch": "partial_update",
        "put": "update",
        "delete": "destroy",
    }
)

urlpatterns = [
    path("orgs/<slug:org_slug>/events/", event_list, name="event-list"),
    path("orgs/<slug:org_slug>/events/<slug:slug>/", event_detail, name="event-detail"),
    path(
        "orgs/<slug:org_slug>/events/<slug:slug>/transition/",
        event_transition,
        name="event-transition",
    ),
    path("orgs/<slug:org_slug>/events/<slug:event_slug>/fields/", field_list, name="field-list"),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/fields/<slug:field_key>/",
        field_detail,
        name="field-detail",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:slug>/pin/set/",
        EventPinView.as_view(),
        {"action": "set"},
        name="event-pin-set",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:slug>/pin/rotate/",
        EventPinView.as_view(),
        {"action": "rotate"},
        name="event-pin-rotate",
    ),
    path(
        "e/<slug:org_slug>/<slug:event_slug>/",
        PublicEventDetailView.as_view(),
        name="public-event-detail",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/stats/",
        EventStatsView.as_view(),
        name="event-stats",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/live/",
        EventLiveView,
        name="event-live",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/banner/",
        EventBannerView.as_view(),
        name="event-banner-upload",
    ),
]
