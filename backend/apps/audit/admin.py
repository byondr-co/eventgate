from django.contrib import admin

from apps.audit.models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("occurred_at", "action", "result", "organization", "event", "actor_type")
    list_filter = ("action", "result", "actor_type")
    search_fields = ("entry_token", "actor_id")
    readonly_fields = tuple(f.name for f in AuditEvent._meta.fields)

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
