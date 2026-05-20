from django.contrib import admin

from apps.notifications.models import NotificationDispatch


@admin.register(NotificationDispatch)
class NotificationDispatchAdmin(admin.ModelAdmin):
    list_display = ("created_at", "channel", "template", "recipient", "status", "attempts")
    list_filter = ("channel", "status")
    search_fields = ("recipient", "template")
    readonly_fields = ("created_at", "sent_at")
