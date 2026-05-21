"""Root URL configuration."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/", include("apps.common.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.orgs.urls")),
    path("api/v1/", include("apps.events.urls")),
    path("api/v1/", include("apps.guests.urls")),
    path("api/v1/", include("apps.devices.urls")),
    path("api/v1/", include("apps.checkins.urls")),
    path("api/v1/", include("apps.walkins.urls")),
    path("api/v1/", include("apps.scanner.urls")),
    path("api/v1/", include("apps.helpdesk.urls")),
    path("api/v1/", include("apps.audit.urls")),
]
