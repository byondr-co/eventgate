"""Guest registration service."""

from __future__ import annotations

import csv as _csv
import io as _io
from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.db.models import Q

from apps.common.tokens import generate_token
from apps.events.models import Event
from apps.guests.models import Guest

if TYPE_CHECKING:
    from apps.shorturls.models import ShortUrl

PRESET_FIELDS = ("name", "email", "phone_or_chat")


class RegistrationError(Exception):
    pass


class EventNotOpen(RegistrationError):
    pass


@transaction.atomic
def register_guest(
    *,
    event: Event,
    payload: dict[str, Any],
    source: str = "public_form",
    referrer: ShortUrl | None = None,
    queue_qr_email_on_commit: bool = False,
) -> Guest:
    if not event.registration_open:
        raise EventNotOpen("Registration is closed for this event.")

    required_keys = list(
        event.registration_fields.filter(required=True).values_list("field_key", flat=True)
    )
    missing = [k for k in required_keys if not payload.get(k)]
    if missing:
        raise RegistrationError(f"Missing required: {', '.join(missing)}")

    preset = {k: payload[k] for k in PRESET_FIELDS if k in payload}
    custom = {k: v for k, v in payload.items() if k not in PRESET_FIELDS}

    known_custom_keys = set(
        event.registration_fields.exclude(field_key__in=PRESET_FIELDS).values_list(
            "field_key", flat=True
        )
    )
    custom = {k: v for k, v in custom.items() if k in known_custom_keys}

    token = generate_token()
    guest = Guest.objects.create(
        organization=event.organization,
        event=event,
        guest_type="pre_registered",
        entry_token=token,
        entry_status="registered_not_arrived",
        info_status="info_completed",
        full_name=preset.get("name", ""),
        email=preset.get("email", ""),
        phone_or_chat=preset.get("phone_or_chat", ""),
        custom_fields=custom,
        source=source,
        referrer_short_url=referrer,
    )

    from apps.guests.tasks import send_qr_email_task

    if queue_qr_email_on_commit:
        transaction.on_commit(lambda: send_qr_email_task.delay(guest_id=str(guest.id)))
    else:
        send_qr_email_task.delay(guest_id=str(guest.id))

    return guest


NAME_ALIASES: set[str] = {"name", "fullname", "full_name", "attendee", "guest_name"}
EMAIL_ALIASES: set[str] = {"email", "email_address", "e-mail", "mail"}
PHONE_ALIASES: set[str] = {"phone", "phone_number", "tel", "mobile", "phone_or_chat"}

MAX_CSV_BYTES = 5 * 1024 * 1024  # 5MB
MAX_PREVIEW_ROWS = 5


def auto_detect(headers: list[str]) -> dict[str, str | None]:
    out: dict[str, str | None] = {}
    for i, header in enumerate(headers):
        norm = header.strip().lower().replace(" ", "_")
        if norm in NAME_ALIASES:
            out[str(i)] = "name"
        elif norm in EMAIL_ALIASES:
            out[str(i)] = "email"
        elif norm in PHONE_ALIASES:
            out[str(i)] = "phone"
        else:
            out[str(i)] = None
    return out


class CsvParseError(Exception):
    """Raised when an uploaded CSV can't be parsed or has no data rows."""


def parse_csv_preview(file_bytes: bytes) -> tuple[list[str], list[list[str]]]:
    """Decode + parse a CSV file. Returns (headers, first_5_data_rows)."""
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CsvParseError("File must be UTF-8 encoded.") from exc

    reader = _csv.reader(_io.StringIO(text))
    try:
        headers = next(reader)
    except StopIteration as exc:
        raise CsvParseError("File must contain at least one data row.") from exc

    rows: list[list[str]] = []
    for row in reader:
        if not row:
            continue
        rows.append(row)
        if len(rows) >= MAX_PREVIEW_ROWS:
            break

    if not rows:
        raise CsvParseError("File must contain at least one data row.")

    return headers, rows


def filtered_event_guests(*, organization, event_slug, search="", entry_status="", guest_type=""):
    """Org/event-scoped guests with the staff-list filters applied. Shared by the
    list, export, and bulk views so they scope identically. No ordering/pagination."""
    qs = Guest.objects.filter(organization=organization, event__slug=event_slug)
    if entry_status:
        qs = qs.filter(entry_status=entry_status)
    if guest_type:
        qs = qs.filter(guest_type=guest_type)
    if search:
        qs = qs.filter(
            Q(full_name__icontains=search)
            | Q(email__icontains=search)
            | Q(phone_or_chat__icontains=search)
        )
    return qs
