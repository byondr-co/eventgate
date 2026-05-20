from __future__ import annotations

import uuid
from typing import ClassVar

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.accounts.managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """Email-keyed user. No password by default — magic-link login at MVP.

    Note: `AbstractBaseUser` contributes a `last_login` field auto-populated by
    Django's `user_logged_in` signal. We do NOT call `django.contrib.auth.login()`
    in our flow (we issue JWT tokens directly from `consume_magic_link`), so that
    field will remain NULL. The canonical "last seen" field is `last_login_at`,
    which `consume_magic_link` sets explicitly.

    Permission framework: `PermissionsMixin` is included so Django admin works,
    but `groups` and `user_permissions` are NOT used for Eventgate authorization.
    All product-level roles live on `OrganizationMembership.role` (Plan B Task 10+).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    class Meta:
        ordering = ("email",)

    def __str__(self) -> str:
        return self.email


class MagicLinkToken(models.Model):
    """Single-use magic-link token. Stores SHA-256 hash, not the raw token."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    requested_from_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        indexes: ClassVar[list[models.Index]] = [models.Index(fields=["email", "expires_at"])]

    def __str__(self) -> str:
        return f"MagicLink<{self.email}>"

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None
