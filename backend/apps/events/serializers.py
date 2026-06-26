from rest_framework import serializers

from apps.events.models import Event, EventSlugAlias, RegistrationField


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

    def validate(self, attrs):
        instance = self.instance
        if instance is not None:
            org = instance.organization
            new_slug = attrs.get("slug")
            if new_slug and new_slug != instance.slug:
                clash = (
                    Event.objects.filter(organization=org, slug=new_slug)
                    .exclude(pk=instance.pk)
                    .exists()
                    or EventSlugAlias.objects.filter(organization=org, slug=new_slug)
                    .exclude(event=instance)
                    .exists()
                )
                if clash:
                    raise serializers.ValidationError(
                        {"slug": "This slug is already in use in this organization."}
                    )
        starts = attrs.get("starts_at", getattr(instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(instance, "ends_at", None))
        if starts and ends and ends < starts:
            raise serializers.ValidationError(
                {"ends_at": "End time must be on or after the start time."}
            )
        return attrs
