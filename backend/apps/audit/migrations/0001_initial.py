import uuid

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("events", "0002_registrationfield"),
        ("guests", "0001_initial"),
        ("orgs", "0002_invite"),
    ]

    operations = [
        migrations.CreateModel(
            name="AuditEvent",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("occurred_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "actor_type",
                    models.CharField(
                        choices=[
                            ("user", "User"),
                            ("scanner_device", "Scanner device"),
                            ("guest", "Guest"),
                            ("system", "System"),
                        ],
                        max_length=16,
                    ),
                ),
                ("actor_id", models.CharField(max_length=64)),
                ("action", models.CharField(max_length=64)),
                (
                    "result",
                    models.CharField(
                        choices=[
                            ("success", "Success"),
                            ("warning", "Warning"),
                            ("error", "Error"),
                        ],
                        max_length=8,
                    ),
                ),
                ("previous_status", models.CharField(blank=True, max_length=24)),
                ("new_status", models.CharField(blank=True, max_length=24)),
                ("gate", models.CharField(blank=True, max_length=64)),
                ("scanner", models.CharField(blank=True, max_length=64)),
                ("entry_token", models.CharField(blank=True, max_length=128)),
                ("details_json", models.JSONField(blank=True, default=dict)),
                (
                    "event",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="+",
                        to="events.event",
                    ),
                ),
                (
                    "guest",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="guests.guest",
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="+",
                        to="orgs.organization",
                    ),
                ),
            ],
            options={
                "ordering": ("-occurred_at",),
                "indexes": [
                    models.Index(fields=["event", "-occurred_at"], name="audit_event_time_idx")
                ],
            },
        ),
    ]
