import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("events", "0004_event_banner_image_event_description"),
        ("guests", "0006_guest_device_id"),
        ("orgs", "0002_invite"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="GoogleFormBridge",
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
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(default="Google Form", max_length=120)),
                ("enabled", models.BooleanField(default=False)),
                ("secret_hash", models.CharField(max_length=64)),
                ("field_mapping", models.JSONField(blank=True, default=dict)),
                (
                    "duplicate_policy",
                    models.CharField(
                        choices=[
                            ("upsert_by_email", "Upsert by email"),
                            ("reject_duplicates", "Reject duplicates"),
                        ],
                        default="upsert_by_email",
                        max_length=32,
                    ),
                ),
                ("last_seen_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="google_form_bridges",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "event",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="google_form_bridges",
                        to="events.event",
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="orgs.organization",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
                "indexes": [
                    models.Index(
                        fields=["event", "enabled"],
                        name="integration_event_i_c2fc4a_idx",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="GoogleFormSubmission",
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
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("submission_id", models.CharField(max_length=160)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("accepted", "Accepted"),
                            ("duplicate", "Duplicate"),
                            ("updated", "Updated"),
                            ("rejected", "Rejected"),
                        ],
                        max_length=16,
                    ),
                ),
                ("payload_hash", models.CharField(max_length=64)),
                ("received_payload", models.JSONField(blank=True, default=dict)),
                ("error", models.TextField(blank=True)),
                ("submitted_at", models.DateTimeField(blank=True, null=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "bridge",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="submissions",
                        to="integrations.googleformbridge",
                    ),
                ),
                (
                    "event",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="google_form_submissions",
                        to="events.event",
                    ),
                ),
                (
                    "guest",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="google_form_submissions",
                        to="guests.guest",
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="orgs.organization",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
                "indexes": [
                    models.Index(
                        fields=["bridge", "status"],
                        name="integration_bridge__d577e2_idx",
                    ),
                    models.Index(
                        fields=["event", "created_at"],
                        name="integration_event_i_eae1a7_idx",
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("bridge", "submission_id"),
                        name="unique_google_form_submission_per_bridge",
                    )
                ],
            },
        ),
    ]
