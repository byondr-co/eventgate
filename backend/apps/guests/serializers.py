from rest_framework import serializers

from apps.guests.models import CsvImport, Guest


class RegistrationSubmitResponseSerializer(serializers.Serializer):
    """Public registration response.

    Returns guest_id plus entry_token. The token is the QR check-in secret,
    but the same guest already receives it via email at the same moment, and
    the response is delivered to the same browser session that submitted the
    form — so echoing it here does not change the security model. The
    confirmation page uses it to build a Telegram deep link
    (https://t.me/<bot>?start=<token>) that lets the guest bind their chat
    without re-typing anything.
    """

    guest_id = serializers.UUIDField()
    entry_token = serializers.CharField()


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
            "updated_at",
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


class CsvImportSerializer(serializers.ModelSerializer):
    error_report_url = serializers.SerializerMethodField()

    class Meta:
        model = CsvImport
        fields = (
            "id",
            "status",
            "total_rows",
            "imported_rows",
            "failed_rows",
            "error_report_url",
            "created_at",
            "completed_at",
        )

    def get_error_report_url(self, obj) -> str | None:
        if not obj.error_report:
            return None
        request = self.context.get("request")
        url = obj.error_report.url
        return request.build_absolute_uri(url) if request else url
