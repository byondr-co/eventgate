import pytest
from django.db import IntegrityError

from apps.events.models import Event, EventSlugAlias
from apps.orgs.models import Organization


@pytest.mark.django_db
def test_slug_alias_unique_per_org():
    org = Organization.objects.create(name="Acme", slug="acme")
    event = Event.objects.create(organization=org, name="Launch", slug="launch")
    EventSlugAlias.objects.create(organization=org, event=event, slug="old-launch")
    with pytest.raises(IntegrityError):
        EventSlugAlias.objects.create(organization=org, event=event, slug="old-launch")
