from django.urls import path

from apps.guests.views import (
    CsvImportPreviewView,
    GuestListView,
    GuestQrView,
    GuestSyncView,
    PublicRegistrationView,
)

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
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/guests/sync/",
        GuestSyncView.as_view(),
        name="guest-sync",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/imports/preview/",
        CsvImportPreviewView.as_view(),
        name="csv-import-preview",
    ),
    path("guests/<uuid:guest_id>/qr.png", GuestQrView.as_view(), name="guest-qr"),
]
