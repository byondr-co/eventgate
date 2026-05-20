from django.urls import path

from apps.checkins.views import CheckinView

urlpatterns = [
    path("checkins/", CheckinView.as_view(), name="checkin"),
]
