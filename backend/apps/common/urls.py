from django.urls import path

from apps.common.views import HealthcheckView, LivenessView

urlpatterns = [
    # Liveness FIRST so the Fly health loop hits the no-DB probe.
    path("health/live/", LivenessView.as_view(), name="liveness"),
    path("health/", HealthcheckView.as_view(), name="healthcheck"),
]
