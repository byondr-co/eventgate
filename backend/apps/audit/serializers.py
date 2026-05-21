from __future__ import annotations

from rest_framework import serializers

from apps.audit.models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "occurred_at",
            "actor_type",
            "actor_id",
            "action",
            "result",
            "previous_status",
            "new_status",
            "gate",
            "scanner",
            "entry_token",
            "details_json",
        )
        read_only_fields = fields
