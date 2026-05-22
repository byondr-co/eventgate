from django.urls import path

from apps.guests.views import (
    CsvImportCommitView,
    CsvImportPreviewView,
    CsvImportStatusView,
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
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/imports/",
        CsvImportCommitView.as_view(),
        name="csv-import-commit",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/imports/<uuid:import_id>/",
        CsvImportStatusView.as_view(),
        name="csv-import-status",
    ),
    path("guests/<uuid:guest_id>/qr.png", GuestQrView.as_view(), name="guest-qr"),
]
