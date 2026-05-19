from django.urls import path

from apps.common.views import HealthcheckView

urlpatterns = [
    path("health/", HealthcheckView.as_view(), name="healthcheck"),
]
