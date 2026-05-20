from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.accounts.models import MagicLinkToken, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "full_name", "is_active", "is_staff", "last_login_at")
    search_fields = ("email", "full_name")
    fieldsets = (
        (None, {"fields": ("email", "full_name")}),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Timestamps", {"fields": ("last_login_at",)}),
    )
    readonly_fields = ("last_login_at",)
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),)


@admin.register(MagicLinkToken)
class MagicLinkTokenAdmin(admin.ModelAdmin):
    list_display = ("email", "created_at", "expires_at", "consumed_at")
    readonly_fields = ("token_hash", "created_at", "consumed_at")
    list_filter = ("consumed_at",)
