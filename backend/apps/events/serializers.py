from rest_framework import serializers

from apps.events.models import Event, RegistrationField


class EventTransitionSerializer(serializers.Serializer):
    """Validates a single ``status`` field against Event.STATUSES choices."""

    status = serializers.ChoiceField(choices=Event.STATUSES)


class RegistrationFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistrationField
        fields = (
            "id",
            "field_key",
            "label_en",
            "label_km",
            "field_type",
            "required",
            "options_json",
            "order_index",
            "is_preset",
        )
        read_only_fields = ("id", "is_preset")


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = (
            "id",
            "name",
            "slug",
            "status",
            "starts_at",
            "ends_at",
            "timezone",
            "venue",
            "registration_open",
            "walkins_enabled",
            "walkin_capacity",
            "created_at",
            "description",
            "banner_image",
        )
        read_only_fields = ("id", "created_at")
