from django.urls import path

from apps.accounts.views import LogoutView, MagicLinkConsumeView, MagicLinkRequestView, MeView

urlpatterns = [
    path("auth/magic-link/request/", MagicLinkRequestView.as_view(), name="magic-link-request"),
    path("auth/magic-link/consume/", MagicLinkConsumeView.as_view(), name="magic-link-consume"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
]
