from __future__ import annotations

from rest_framework import serializers

from apps.devices.models import ScannerDevice


class DeviceCreateSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=80)
    role = serializers.ChoiceField(choices=[c[0] for c in ScannerDevice.ROLES])
    gate = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")

    def validate(self, attrs: dict) -> dict:
        event = self.context.get("event")
        if event is not None:
            label = attrs.get("label", "")
            role = attrs.get("role", "")
            # Only active (non-revoked) devices reserve a (label, role). Revoking a
            # device frees its label so it can be re-created.
            clash = ScannerDevice.objects.filter(
                event=event, label=label, role=role, revoked_at__isnull=True
            ).exists()
            if clash:
                raise serializers.ValidationError(
                    {"label": "A device with this label and role already exists for this event."}
                )
        return attrs


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScannerDevice
        fields = (
            "id",
            "label",
            "role",
            "gate",
            "enrolled_at",
            "last_seen_at",
            "revoked_at",
            "created_at",
        )
