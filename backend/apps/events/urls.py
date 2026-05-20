from django.urls import path

from apps.events.views import EventViewSet, RegistrationFieldViewSet

event_list = EventViewSet.as_view({"get": "list", "post": "create"})
event_detail = EventViewSet.as_view(
    {
        "get": "retrieve",
        "patch": "partial_update",
        "put": "update",
        "delete": "destroy",
    }
)
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
    path("orgs/<slug:org_slug>/events/<slug:event_slug>/fields/", field_list, name="field-list"),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/fields/<slug:field_key>/",
        field_detail,
        name="field-detail",
    ),
]
