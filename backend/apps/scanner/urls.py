from django.urls import path

from apps.scanner.views import EscalationView

urlpatterns = [
    path("scanner/escalations/", EscalationView.as_view(), name="scanner-escalation"),
]
