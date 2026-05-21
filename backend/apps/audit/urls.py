from django.urls import path

from apps.audit.views import AuditListView

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/audit/",
        AuditListView.as_view(),
        name="audit-list",
    ),
]
