from __future__ import annotations

import uuid
from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone
from slugify import slugify


class OrganizationManager(models.Manager):
    def create_with_unique_slug(self, *, name: str, **extra) -> Organization:
        base = slugify(name) or "org"
        candidate = base
        n = 0
        while self.filter(slug=candidate).exists():
            n += 1
            candidate = f"{base}-{n}"
        return self.create(name=name, slug=candidate, **extra)  # type: ignore[return-value]


class Organization(models.Model):
    """Top-level tenant. Everything user-visible hangs off this."""

    ROLES = (
        ("owner", "Owner"),
        ("admin", "Admin"),
        ("manager", "Manager"),
        ("staff", "Staff"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80, unique=True)
    country_code = models.CharField(max_length=2, default="KH")
    default_timezone = models.CharField(max_length=64, default="Asia/Phnom_Penh")
    plan = models.CharField(max_length=32, default="trial")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = OrganizationManager()

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name) or "org"
        super().save(*args, **kwargs)


class OrganizationMembership(models.Model):
    """User <-> Organization with a role. One row per (user, org)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships"
    )
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(max_length=16, choices=Organization.ROLES, default="staff")
    is_active = models.BooleanField(default=True)
    invited_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(fields=("user", "organization"), name="unique_user_per_org"),
        ]
        ordering = ("organization__name", "user__email")

    def __str__(self) -> str:
        return f"{self.user.email} @ {self.organization.name} ({self.role})"


class Invite(models.Model):
    """Email invitation to join an Organization with a specific role.

    Single-use token, 72h TTL, scoped to the recipient email.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="invites")
    email = models.EmailField()
    role = models.CharField(max_length=16, choices=Organization.ROLES, default="staff")
    token_hash = models.CharField(max_length=64, unique=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes: ClassVar = [models.Index(fields=("organization", "email"))]
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=("organization", "email"),
                condition=models.Q(accepted_at__isnull=True, revoked_at__isnull=True),
                name="one_open_invite_per_email_per_org",
            ),
        ]

    def __str__(self) -> str:
        return f"Invite<{self.email} → {self.organization.slug}>"

    @property
    def is_active(self) -> bool:
        return (
            self.accepted_at is None
            and self.revoked_at is None
            and self.expires_at > timezone.now()
        )
