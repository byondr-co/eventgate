from __future__ import annotations

from rest_framework import serializers


class WalkinNextRequestSerializer(serializers.Serializer):
    gate = serializers.CharField(max_length=64)
    scanner_label = serializers.CharField(max_length=64)


class WalkinNextResponseSerializer(serializers.Serializer):
    guest_id = serializers.UUIDField()
    entry_token = serializers.CharField()
    claim_url = serializers.CharField()
    # Capacity fields are appended by the view AFTER serialization so the
    # base contract stays minimal here; declared as optional for clarity.
    status = serializers.CharField(required=False)
    walkin_count = serializers.IntegerField(required=False)
    walkin_capacity = serializers.IntegerField(required=False)


class WalkinClaimResponseSerializer(serializers.Serializer):
    guest_id = serializers.UUIDField()
    event_slug = serializers.CharField()
    org_slug = serializers.CharField()
    info_form_url = serializers.CharField()
