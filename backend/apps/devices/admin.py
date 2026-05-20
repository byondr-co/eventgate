from django.contrib import admin

from apps.devices.models import EventPinSession, ScannerDevice


@admin.register(ScannerDevice)
class ScannerDeviceAdmin(admin.ModelAdmin):
    list_display = ("label", "role", "event", "enrolled_at", "last_seen_at", "revoked_at")
    list_filter = ("role",)
    search_fields = ("label", "gate")


@admin.register(EventPinSession)
class EventPinSessionAdmin(admin.ModelAdmin):
    list_display = ("scanner_device", "event", "unlocked_at", "expires_at")
    list_filter = ("event",)
