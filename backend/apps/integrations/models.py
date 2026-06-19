from __future__ import annotations

from typing import ClassVar

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.common.models import OrgScopedModel
from apps.common.tokens import generate_token, hash_token, tokens_match


class GoogleFormBridge(OrgScopedModel):
    """Event-scoped Apps Script bridge for Google Form or Sheet submissions."""

    DUPLICATE_POLICIES = (
        ("upsert_by_email", "Upsert by email"),
        ("reject_duplicates", "Reject duplicates"),
    )

    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="google_form_bridges",
    )
    name = models.CharField(max_length=120, default="Google Form")
    enabled = models.BooleanField(default=False)
    secret_hash = models.CharField(max_length=64)
    field_mapping = models.JSONField(default=dict, blank=True)
    seen_labels = models.JSONField(default=list, blank=True)
    test_mode = models.BooleanField(default=False)
    duplicate_policy = models.CharField(
        max_length=32,
        choices=DUPLICATE_POLICIES,
        default="upsert_by_email",
    )
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="google_form_bridges",
    )
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes: ClassVar = [
            models.Index(fields=("event", "enabled")),
        ]

    def save(self, *args, **kwargs):
        if self.event_id:
            self.organization = self.event.organization
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = {*update_fields, "organization"}
        super().save(*args, **kwargs)

    @classmethod
    def create_with_secret(
        cls,
        *,
        event,
        created_by,
        name: str = "Google Form",
        field_mapping: dict[str, str] | None = None,
        duplicate_policy: str = "upsert_by_email",
    ) -> tuple[GoogleFormBridge, str]:
        raw_secret = generate_token()
        bridge = cls.objects.create(
            organization=event.organization,
            event=event,
            name=name,
            created_by=created_by,
            secret_hash=hash_token(raw_secret),
            field_mapping=field_mapping or {},
            duplicate_policy=duplicate_policy,
        )
        return bridge, raw_secret

    def rotate_secret(self) -> str:
        raw_secret = generate_token()
        self.secret_hash = hash_token(raw_secret)
        self.save(update_fields=["secret_hash", "updated_at"])
        return raw_secret

    def check_secret(self, raw_secret: str) -> bool:
        return tokens_match(raw_secret, self.secret_hash)

    def mark_seen(self) -> None:
        self.last_seen_at = timezone.now()
        self.save(update_fields=["last_seen_at", "updated_at"])

    def __str__(self) -> str:
        return f"{self.name} -> {self.event.slug}"


class GoogleFormSubmission(OrgScopedModel):
    """Idempotency and audit record for one Google Form bridge submission."""

    STATUSES = (
        ("accepted", "Accepted"),
        ("duplicate", "Duplicate"),
        ("updated", "Updated"),
        ("rejected", "Rejected"),
    )

    bridge = models.ForeignKey(
        GoogleFormBridge,
        on_delete=models.CASCADE,
        related_name="submissions",
    )
    event = models.ForeignKey(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="google_form_submissions",
    )
    submission_id = models.CharField(max_length=160)
    guest = models.ForeignKey(
        "guests.Guest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="google_form_submissions",
    )
    KINDS = (("real", "Real"), ("test", "Test"))
    kind = models.CharField(max_length=8, choices=KINDS, default="real")
    status = models.CharField(max_length=16, choices=STATUSES)
    payload_hash = models.CharField(max_length=64)
    received_payload = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("bridge", "submission_id"),
                name="unique_google_form_submission_per_bridge",
            )
        ]
        indexes: ClassVar = [
            models.Index(fields=("bridge", "status")),
            models.Index(fields=("event", "created_at")),
        ]
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if self.bridge_id:
            bridge_event = self.bridge.event
            bridge_organization = self.bridge.organization
            self.event = bridge_event
            self.organization = bridge_organization

            if self.guest_id and (
                self.guest.event_id != bridge_event.id
                or self.guest.organization_id != bridge_organization.id
            ):
                raise ValidationError(
                    "Google Form submission guest must belong to the same event "
                    "and organization as the bridge."
                )

            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = {*update_fields, "event", "organization"}
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.bridge_id}:{self.submission_id}:{self.status}"
