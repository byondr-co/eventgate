"""POST /helpdesk/manual-review/<guest_id>/resolve/

Help-desk override authority per brief Appendix A row 8: staff role may
transition a manual_review guest to checked_in or voided. Both transitions
write a helpdesk.manual_review_resolved audit row.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import write_audit
from apps.common.permissions import IsOrgMember
from apps.events.live_publish import schedule_event_changed
from apps.events.models import Event
from apps.guests.models import Guest
from apps.guests.transitions import InvalidTransition, apply_entry_transition

_ALLOWED_ACTIONS = {"approve_checkin": "checked_in", "void": "voided"}


class ManualReviewResolveView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember)

    def post(self, request, org_slug, event_slug, guest_id):
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        guest = get_object_or_404(Guest, id=guest_id, event=event)
        if guest.entry_status != "manual_review":
            raise ValidationError({"guest": "Not in manual_review state."})

        action = (request.data.get("action") or "").strip()
        if action not in _ALLOWED_ACTIONS:
            raise ValidationError({"action": f"Must be one of {sorted(_ALLOWED_ACTIONS)}."})
        notes = (request.data.get("notes") or "").strip()

        target = _ALLOWED_ACTIONS[action]
        try:
            guest = apply_entry_transition(guest, to=target)
        except InvalidTransition as exc:
            raise ValidationError({"transition": str(exc)}) from exc

        write_audit(
            organization=request.organization,
            event=event,
            guest=guest,
            actor_type="user",
            actor_id=str(request.user.id),
            action="helpdesk.manual_review_resolved",
            result="success",
            previous_status="manual_review",
            new_status=target,
            details={"action": action, "notes": notes, "guest_id": str(guest.id)},
        )
        schedule_event_changed(
            event_id=event.id,
            reason="helpdesk.manual_review_resolved",
            keys=("stats", "audit", "helpdesk", "manual_review", "guests_count"),
        )
        return Response(
            {
                "guest_id": str(guest.id),
                "entry_status": guest.entry_status,
            }
        )
