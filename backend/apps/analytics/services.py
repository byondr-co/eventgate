from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from apps.analytics.models import EventGateMinuteMetric

MetricCounter = Literal["checkins", "duplicates", "conflicts", "escalations"]
_COUNTERS = {"checkins", "duplicates", "conflicts", "escalations"}

logger = logging.getLogger(__name__)


def minute_floor(dt: datetime) -> datetime:
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone=UTC)
    return dt.astimezone(UTC).replace(second=0, microsecond=0)


def increment_event_metric(
    *,
    organization_id,
    event_id,
    counter: MetricCounter | str,
    occurred_at: datetime | None = None,
    gate: str = "",
    scanner: str = "",
) -> None:
    if counter not in _COUNTERS:
        raise ValueError(f"Unknown metric counter: {counter}")

    bucket_start = minute_floor(occurred_at or timezone.now())
    clean_gate = (gate or "")[:64]
    clean_scanner = (scanner or "")[:64]

    for attempt in range(2):
        try:
            with transaction.atomic():
                metric, _ = EventGateMinuteMetric.objects.get_or_create(
                    event_id=event_id,
                    bucket_start=bucket_start,
                    gate=clean_gate,
                    scanner=clean_scanner,
                    defaults={"organization_id": organization_id},
                )
                EventGateMinuteMetric.objects.filter(pk=metric.pk).update(
                    updated_at=timezone.now(),
                    **{counter: F(counter) + 1},
                )
            return
        except IntegrityError:
            if attempt == 1:
                raise


def schedule_metric_increment(
    *,
    organization_id,
    event_id,
    counter: MetricCounter,
    occurred_at: datetime | None = None,
    gate: str = "",
    scanner: str = "",
) -> None:
    metric_at = occurred_at or timezone.now()

    def _increment() -> None:
        try:
            increment_event_metric(
                organization_id=organization_id,
                event_id=event_id,
                counter=counter,
                occurred_at=metric_at,
                gate=gate,
                scanner=scanner,
            )
        except Exception:
            logger.exception(
                "Failed to increment event live metric",
                extra={"event_id": str(event_id), "counter": counter},
            )

    transaction.on_commit(_increment)
