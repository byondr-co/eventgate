from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import OrgScopedModel


class EventGateMinuteMetric(OrgScopedModel):
    """Derived per-minute gate counters for live dashboard analytics."""

    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="gate_metrics")
    bucket_start = models.DateTimeField()
    gate = models.CharField(max_length=64, blank=True, default="")
    scanner = models.CharField(max_length=64, blank=True, default="")
    checkins = models.PositiveIntegerField(default=0)
    duplicates = models.PositiveIntegerField(default=0)
    conflicts = models.PositiveIntegerField(default=0)
    escalations = models.PositiveIntegerField(default=0)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("event", "bucket_start", "gate", "scanner"),
                name="unique_gate_metric_bucket",
            )
        ]
        indexes: ClassVar = [
            models.Index(fields=("event", "-bucket_start"), name="metric_event_time_idx"),
            models.Index(fields=("event", "gate", "-bucket_start"), name="metric_gate_time_idx"),
        ]
        ordering = ("-bucket_start", "gate", "scanner")

    def save(self, *args, **kwargs):
        if self.event_id:
            self.organization = self.event.organization
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = {*kwargs["update_fields"], "organization"}
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.event_id}:{self.bucket_start:%Y-%m-%d %H:%M} {self.gate}/{self.scanner}"
