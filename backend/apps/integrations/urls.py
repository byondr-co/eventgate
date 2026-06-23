from django.urls import path

from apps.integrations.views import (
    GoogleFormBridgeDetailView,
    GoogleFormBridgeDetectedFieldsView,
    GoogleFormBridgeListCreateView,
    GoogleFormBridgeRotateSecretView,
    GoogleFormBridgeTestSubmissionView,
    GoogleFormSubmissionWebhookView,
)

urlpatterns = [
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/",
        GoogleFormBridgeListCreateView.as_view(),
        name="google-form-bridge-list",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/<uuid:bridge_id>/",
        GoogleFormBridgeDetailView.as_view(),
        name="google-form-bridge-detail",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/<uuid:bridge_id>/rotate-secret/",
        GoogleFormBridgeRotateSecretView.as_view(),
        name="google-form-bridge-rotate-secret",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/<uuid:bridge_id>/detected-fields/",
        GoogleFormBridgeDetectedFieldsView.as_view(),
        name="google-form-bridge-detected-fields",
    ),
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/<uuid:bridge_id>/test-submission/",
        GoogleFormBridgeTestSubmissionView.as_view(),
        name="google-form-bridge-test-submission",
    ),
    path(
        "integrations/google-forms/<uuid:bridge_id>/submissions/",
        GoogleFormSubmissionWebhookView.as_view(),
        name="google-form-submission-webhook",
    ),
]
