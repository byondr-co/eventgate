"""QR delivery + CSV import Celery tasks."""

from __future__ import annotations

import csv as _csv
import io as _io
import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.mail import EmailMessage
from django.core.validators import validate_email
from django.utils import timezone

from apps.audit.services import write_audit
from apps.common.qr import render_png
from apps.guests.models import CsvImport, Guest
from apps.notifications.models import NotificationDispatch

logger = logging.getLogger(__name__)


@shared_task(name="guests.send_qr_email", bind=True, max_retries=3, default_retry_delay=60)
def send_qr_email_task(self, *, guest_id: str) -> str:
    guest = Guest.objects.select_related("event", "organization").get(id=guest_id)
    if not guest.email:
        return "skipped:no_email"

    dispatch = NotificationDispatch.objects.create(
        organization=guest.organization,
        event=guest.event,
        guest=guest,
        channel="email",
        template="pre_reg_qr",
        recipient=guest.email,
        status="queued",
    )

    try:
        png = render_png(guest.entry_token)
        telegram_line = ""
        bot_username = getattr(settings, "TELEGRAM_BOT_USERNAME", "")
        if bot_username:
            telegram_line = (
                f"\n\nPrefer Telegram? Tap here to receive your QR via @{bot_username}: "
                f"https://t.me/{bot_username}?start={guest.entry_token}"
            )
        body = (
            f"Hi {guest.full_name or 'there'},\n\n"
            f"You're registered for {guest.event.name}.\n\n"
            "Show the attached QR code at the entrance — staff will scan it.\n"
            "Keep it private; do not share."
            f"{telegram_line}\n\n"
            "See you there!\n"
            "— Gatethres"
        )
        msg = EmailMessage(
            subject=f"You're registered for {guest.event.name}",
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[guest.email],
        )
        msg.attach(f"gatethres-{guest.id}.png", png, "image/png")
        msg.send(fail_silently=False)

        dispatch.status = "sent"
        dispatch.sent_at = timezone.now()
        dispatch.attempts = 1
        dispatch.save(update_fields=["status", "sent_at", "attempts"])
    except Exception as exc:
        dispatch.status = "failed"
        dispatch.error = str(exc)
        dispatch.attempts += 1
        dispatch.save(update_fields=["status", "error", "attempts"])
        raise self.retry(exc=exc) from exc

    return str(dispatch.id)


@shared_task(name="guests.process_csv_import")
def process_csv_import_task(*, import_id: str) -> str:
    from apps.guests.services import (
        PRESET_FIELDS,
        RegistrationError,
        register_guest,
    )

    ci = CsvImport.objects.select_related("event__organization").get(id=import_id)
    if ci.status not in ("pending", "running"):
        return f"skipped:status_{ci.status}"

    ci.status = "running"
    ci.save(update_fields=["status"])

    try:
        # column_mapping is {col_idx_str: target} where target is "name"/"email"/"phone"
        # or a RegistrationField.id (string UUID), or null (skip).
        # Invert: target -> col_idx (int) for fast lookup.
        mapping: dict[str, int] = {}
        for col_idx_str, target in (ci.column_mapping or {}).items():
            if target:
                mapping[str(target)] = int(col_idx_str)

        # Map RegistrationField.id (string) -> field_key for inserting into custom_fields.
        rf_map = {
            str(rf.id): rf.field_key
            for rf in ci.event.registration_fields.exclude(field_key__in=PRESET_FIELDS)
        }

        ci.file.seek(0)
        text = ci.file.read().decode("utf-8-sig")
        reader = _csv.reader(_io.StringIO(text))
        try:
            next(reader)  # skip header
        except StopIteration:
            ci.status = "failed"
            ci.save(update_fields=["status"])
            return "failed:empty"

        total = imported = failed = 0
        error_rows: list[list[str]] = [["row_number", "raw_data", "errors"]]

        for line_idx, row in enumerate(reader, start=2):  # header is row 1
            total += 1
            raw = ",".join(row)

            def col(key: str, _row=row) -> str:
                idx = mapping.get(key)
                if idx is None or idx >= len(_row):
                    return ""
                return _row[idx].strip()

            payload: dict[str, str] = {}
            if "name" in mapping:
                payload["name"] = col("name")
            if "email" in mapping:
                payload["email"] = col("email")
            if "phone" in mapping:
                payload["phone_or_chat"] = col("phone")
            for rf_id, field_key in rf_map.items():
                if rf_id in mapping:
                    payload[field_key] = col(rf_id)

            # Validate email format before further checks (preset email is required).
            if payload.get("email"):
                try:
                    validate_email(payload["email"])
                except ValidationError:
                    failed += 1
                    error_rows.append([str(line_idx), raw, "Invalid email address"])
                    continue

            # Duplicate check: existing Guest with same email in same event.
            if (
                payload.get("email")
                and Guest.objects.filter(event=ci.event, email=payload["email"]).exists()
            ):
                failed += 1
                error_rows.append(
                    [str(line_idx), raw, "Duplicate: email already registered for this event"]
                )
                continue

            try:
                guest = register_guest(event=ci.event, payload=payload, source="csv_import")
            except RegistrationError as exc:
                failed += 1
                error_rows.append([str(line_idx), raw, str(exc)])
                continue
            except Exception as exc:
                failed += 1
                error_rows.append([str(line_idx), raw, f"Unexpected error: {exc}"])
                continue

            imported += 1
            write_audit(
                organization=ci.event.organization,
                event=ci.event,
                guest=guest,
                actor_type="user",
                actor_id=str(ci.uploaded_by_id),
                action="guest.created_via_csv",
                result="success",
                entry_token=guest.entry_token,
                details={"csv_import_id": str(ci.id), "row_number": line_idx},
            )

        # Write error report if any failures.
        if failed > 0:
            buf = _io.StringIO()
            _csv.writer(buf).writerows(error_rows)
            ci.error_report.save(
                f"errors-{ci.id}.csv",
                ContentFile(buf.getvalue().encode("utf-8")),
                save=False,
            )

        ci.total_rows = total
        ci.imported_rows = imported
        ci.failed_rows = failed
        ci.status = "complete"
        ci.completed_at = timezone.now()
        ci.save(
            update_fields=[
                "total_rows",
                "imported_rows",
                "failed_rows",
                "status",
                "completed_at",
                "error_report",
            ]
        )

        return f"complete:{imported}/{total}"
    except Exception as exc:
        # Top-level guard: any unhandled exception (stale settings, schema
        # validation, transient I/O, etc.) must flip status to "failed" so the
        # row doesn't get stuck in "running" forever. Sentry will still see it
        # via logger.exception().
        logger.exception("process_csv_import unhandled exception for import_id=%s", ci.id)
        ci.refresh_from_db()
        ci.status = "failed"
        ci.last_error = f"{type(exc).__name__}: {exc}"
        ci.completed_at = timezone.now()
        ci.save(update_fields=["status", "last_error", "completed_at"])
        return f"failed:{type(exc).__name__}"


@shared_task(name="guests.sweep_preview_imports")
def sweep_preview_imports_task() -> str:
    """Periodic: delete CsvImport rows stuck in 'preview' status for >24h."""
    cutoff = timezone.now() - timedelta(hours=24)
    qs = CsvImport.objects.filter(status="preview", created_at__lt=cutoff)
    count = qs.count()
    qs.delete()
    return f"swept:{count}"
