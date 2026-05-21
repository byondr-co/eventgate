from django.urls import path

from apps.helpdesk.views import (
    HelpDeskTicketClaimView,
    HelpDeskTicketListView,
    HelpDeskTicketReleaseView,
    HelpDeskTicketResolveView,
)
from apps.helpdesk.views_manual_review import ManualReviewResolveView

PREFIX = "orgs/<slug:org_slug>/events/<slug:event_slug>/helpdesk/tickets"

urlpatterns = [
    path(f"{PREFIX}/", HelpDeskTicketListView.as_view(), name="helpdesk-ticket-list"),
    path(
        f"{PREFIX}/<int:ticket_id>/claim/", HelpDeskTicketClaimView.as_view(), name="helpdesk-claim"
    ),
    path(
        f"{PREFIX}/<int:ticket_id>/release/",
        HelpDeskTicketReleaseView.as_view(),
        name="helpdesk-release",
    ),
    path(
        f"{PREFIX}/<int:ticket_id>/resolve/",
        HelpDeskTicketResolveView.as_view(),
        name="helpdesk-resolve",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/helpdesk/manual-review/"
        "<uuid:guest_id>/resolve/",
        ManualReviewResolveView.as_view(),
        name="helpdesk-manual-review-resolve",
    ),
]
