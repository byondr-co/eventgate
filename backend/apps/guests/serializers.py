from rest_framework import serializers

from apps.guests.models import Guest


class RegistrationSubmitResponseSerializer(serializers.Serializer):
    """Public registration response — intentionally NOT exposing entry_token."""

    guest_id = serializers.UUIDField()


class GuestSerializer(serializers.ModelSerializer):
    """Dashboard guest serializer. entry_token excluded — staff fetches QR via the
    dedicated /qr.png endpoint."""

    class Meta:
        model = Guest
        fields = (
            "id",
            "guest_type",
            "entry_status",
            "info_status",
            "full_name",
            "email",
            "phone_or_chat",
            "custom_fields",
            "source",
            "checked_in_at",
            "created_at",
        )
        read_only_fields = fields


class GuestSyncSerializer(serializers.ModelSerializer):
    """Minimal guest projection for the scanner cache.

    Carries the fields the offline path needs to validate a scanned token
    locally and render a "QUEUED" optimistic result card. Excludes anything
    PII-heavier than name/email — richer info is fetched on-demand by the
    (future) help-desk lane.
    """

    id = serializers.UUIDField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Guest
        fields = (
            "id",
            "entry_token",
            "full_name",
            "email",
            "guest_type",
            "entry_status",
            "info_status",
            "updated_at",
        )
