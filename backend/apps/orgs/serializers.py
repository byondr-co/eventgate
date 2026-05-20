from rest_framework import serializers

from apps.orgs.models import Organization, OrganizationMembership


class OrganizationSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "country_code",
            "default_timezone",
            "plan",
            "created_at",
            "role",
        )
        read_only_fields = ("id", "slug", "plan", "created_at", "role")

    def get_role(self, obj: Organization) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        m = OrganizationMembership.objects.filter(
            organization=obj, user=request.user, is_active=True
        ).first()
        return m.role if m else None


class MembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = (
            "id",
            "user_email",
            "user_full_name",
            "role",
            "is_active",
            "accepted_at",
            "created_at",
        )
        read_only_fields = ("id", "user_email", "user_full_name", "accepted_at", "created_at")
