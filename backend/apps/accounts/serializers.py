from rest_framework import serializers

from apps.accounts.models import User


class MagicLinkRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class MagicLinkConsumeSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=20, max_length=64)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "full_name", "created_at", "last_login_at")
        read_only_fields = ("id", "email", "created_at", "last_login_at")
