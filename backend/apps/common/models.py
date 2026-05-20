"""Cross-cutting base models.

Every tenant-scoped model in the SaaS inherits OrgScopedModel. The manager
gives a default `.for_org(org)` filter that views should use.
"""

from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class OrgScopedQuerySet(models.QuerySet):
    def for_org(self, org) -> OrgScopedQuerySet:
        return self.filter(organization=org)


class OrgScopedManager(models.Manager.from_queryset(OrgScopedQuerySet)):  # type: ignore[misc]
    pass


class OrgScopedModel(models.Model):
    """Abstract base for any model that belongs to one organization."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "orgs.Organization",
        on_delete=models.CASCADE,
        related_name="+",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = OrgScopedManager()

    class Meta:
        abstract = True
