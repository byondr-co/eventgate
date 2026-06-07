from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.events.models import Event, RegistrationField
from apps.integrations.models import GoogleFormBridge, GoogleFormSubmission

BRIDGE_FIELDS: tuple[str, ...] = (
    "id",
    "name",
    "enabled",
    "field_mapping",
    "duplicate_policy",
    "webhook_url",
    "last_seen_at",
    "recent_submissions",
    "created_at",
    "updated_at",
)
BRIDGE_READ_ONLY_FIELDS: tuple[str, ...] = (
    "id",
    "webhook_url",
    "last_seen_at",
    "recent_submissions",
    "created_at",
    "updated_at",
)


def event_field_keys(event: Event) -> set[str]:
    return set(RegistrationField.objects.filter(event=event).values_list("field_key", flat=True))


class GoogleFormBridgeSerializer(serializers.ModelSerializer):
    webhook_url = serializers.SerializerMethodField()
    recent_submissions = serializers.SerializerMethodField()

    class Meta:
        model = GoogleFormBridge
        fields = BRIDGE_FIELDS
        read_only_fields = BRIDGE_READ_ONLY_FIELDS

    def validate_field_mapping(self, value: Any) -> dict[str, str]:
        if not isinstance(value, dict):
            raise serializers.ValidationError("field_mapping must be an object.")

        event = self.context["event"]
        allowed = event_field_keys(event)
        validated: dict[str, str] = {}
        for label, target in value.items():
            if not isinstance(label, str) or not label.strip():
                raise serializers.ValidationError("Google field labels must be non-empty strings.")
            if not isinstance(target, str) or target not in allowed:
                raise serializers.ValidationError(
                    f"Mapping target '{target}' is not valid for this event."
                )
            validated[label] = target

        return validated

    def get_webhook_url(self, obj: GoogleFormBridge) -> str:
        path = f"/api/v1/integrations/google-forms/{obj.id}/submissions/"
        request = self.context.get("request")
        if request is None:
            return path
        return request.build_absolute_uri(path)

    def get_recent_submissions(self, obj: GoogleFormBridge) -> list[dict[str, Any]]:
        return [
            {
                "id": str(row.id),
                "submission_id": row.submission_id,
                "status": row.status,
                "error": row.error,
                "created_at": row.created_at,
                "processed_at": row.processed_at,
            }
            for row in obj.submissions.order_by("-created_at")[:5]
        ]


class GoogleFormBridgeCreateSerializer(GoogleFormBridgeSerializer):
    secret = serializers.CharField(read_only=True)

    class Meta:
        model = GoogleFormBridge
        fields = (*BRIDGE_FIELDS, "secret")
        read_only_fields = (*BRIDGE_READ_ONLY_FIELDS, "secret")


class GoogleFormSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = GoogleFormSubmission
        fields = ("id", "submission_id", "status", "guest", "error", "created_at", "processed_at")
        read_only_fields = fields
