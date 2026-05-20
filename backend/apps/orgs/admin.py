from typing import ClassVar

from django.contrib import admin

from apps.orgs.models import Invite, Organization, OrganizationMembership


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "plan", "country_code", "created_at")
    search_fields = ("name", "slug")
    prepopulated_fields: ClassVar = {"slug": ("name",)}


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "organization", "role", "is_active", "accepted_at")
    list_filter = ("role", "is_active")
    search_fields = ("user__email", "organization__name")


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = ("email", "organization", "role", "expires_at", "accepted_at", "revoked_at")
    list_filter = ("role",)
    search_fields = ("email", "organization__name")
    readonly_fields = ("token_hash", "created_at", "accepted_at", "revoked_at")
