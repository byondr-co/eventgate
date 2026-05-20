from django.urls import path

from apps.walkins.views import WalkinClaimView, WalkinDisplayNextView, WalkinInfoView

urlpatterns = [
    path(
        "walkins/displays/next/",
        WalkinDisplayNextView.as_view(),
        name="walkin-display-next",
    ),
    path(
        "e/<slug:org_slug>/<slug:event_slug>/claim/<str:token>/",
        WalkinClaimView.as_view(),
        name="walkin-claim",
    ),
    path(
        "e/<slug:org_slug>/<slug:event_slug>/info/<str:token>/",
        WalkinInfoView.as_view(),
        name="walkin-info",
    ),
]
