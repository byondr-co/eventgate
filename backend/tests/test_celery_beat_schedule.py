"""Verify periodic schedule entries are registered."""

from django.conf import settings


def test_sweep_preview_imports_in_beat_schedule():
    schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", {})
    assert "sweep-preview-imports" in schedule
    entry = schedule["sweep-preview-imports"]
    assert entry["task"] == "guests.sweep_preview_imports"
    assert isinstance(entry["schedule"], int | float)
    # Daily cadence — guard against accidental sub-hour scheduling.
    assert entry["schedule"] >= 60 * 60
