from django.contrib import admin

from apps.helpdesk.models import HelpDeskTicketState


@admin.register(HelpDeskTicketState)
class HelpDeskTicketStateAdmin(admin.ModelAdmin):
    list_display = ("created_at", "claim_status", "organization", "event", "assigned_to")
    list_filter = ("claim_status", "resolution_action")
    readonly_fields = ("audit_event", "organization", "event", "created_at", "updated_at")
