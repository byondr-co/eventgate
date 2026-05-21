from __future__ import annotations

from rest_framework import serializers

from apps.audit.models import AuditEvent
from apps.helpdesk.models import HelpDeskTicketState


class AuditEventCompactSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "occurred_at",
            "action",
            "result",
            "entry_token",
            "gate",
            "scanner",
            "actor_type",
            "actor_id",
            "details_json",
        )


class HelpDeskTicketStateSerializer(serializers.ModelSerializer):
    audit_event = AuditEventCompactSerializer(read_only=True)
    assigned_to_email = serializers.SerializerMethodField()

    class Meta:
        model = HelpDeskTicketState
        fields = (
            "id",
            "audit_event",
            "claim_status",
            "assigned_to_email",
            "claimed_at",
            "resolved_at",
            "resolution_action",
            "resolution_notes",
            "created_at",
            "updated_at",
        )

    def get_assigned_to_email(self, obj) -> str | None:
        return obj.assigned_to.email if obj.assigned_to_id else None
