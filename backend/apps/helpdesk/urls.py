from django.urls import path

from apps.helpdesk.views import HelpDeskTicketListView

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/helpdesk/tickets/",
        HelpDeskTicketListView.as_view(),
        name="helpdesk-ticket-list",
    ),
]
