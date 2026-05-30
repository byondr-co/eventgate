from __future__ import annotations

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.events.models import Event
from apps.shorturls.models import ShortUrl
from apps.shorturls.services import generate_short_code


@receiver(post_save, sender=Event)
def create_short_url_for_event(sender, instance: Event, created: bool, **kwargs) -> None:
    if not created:
        return
    org_slug = instance.organization.slug
    target = f"{getattr(settings, 'PUBLIC_BASE_URL', '')}/e/{org_slug}/{instance.slug}/register"
    ShortUrl.objects.create(
        short_code=generate_short_code(),
        target_url=target,
        event=instance,
    )
