import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from apps.orgs.models import Organization, OrganizationMembership

User = get_user_model()


@pytest.mark.django_db
class TestOrganization:
    def test_create_org_auto_generates_slug(self) -> None:
        org = Organization.objects.create(name="Phnom Penh Conf 2026")
        assert org.slug == "phnom-penh-conf-2026"

    def test_slug_is_unique(self) -> None:
        Organization.objects.create(name="Acme")
        with pytest.raises(IntegrityError):
            Organization.objects.create(name="Acme")

    def test_slug_collision_appends_suffix(self) -> None:
        a = Organization.objects.create_with_unique_slug(name="Acme")
        b = Organization.objects.create_with_unique_slug(name="Acme")
        assert a.slug == "acme"
        assert b.slug.startswith("acme-")
        assert a.slug != b.slug

    def test_default_country_and_timezone(self) -> None:
        org = Organization.objects.create(name="Sample")
        assert org.country_code == "KH"
        assert org.default_timezone == "Asia/Phnom_Penh"

    def test_str_returns_name(self) -> None:
        org = Organization.objects.create(name="Sample")
        assert str(org) == "Sample"


@pytest.mark.django_db
class TestOrganizationMembership:
    def test_create_membership(self) -> None:
        user = User.objects.create_user(email="alice@example.com")
        org = Organization.objects.create(name="Acme")
        m = OrganizationMembership.objects.create(user=user, organization=org, role="owner")
        assert m.role == "owner"
        assert m.is_active is True

    def test_user_org_pair_is_unique(self) -> None:
        user = User.objects.create_user(email="alice@example.com")
        org = Organization.objects.create(name="Acme")
        OrganizationMembership.objects.create(user=user, organization=org, role="owner")
        with pytest.raises(IntegrityError):
            OrganizationMembership.objects.create(user=user, organization=org, role="admin")

    def test_role_choices_enforced(self) -> None:
        from django.core.exceptions import ValidationError

        user = User.objects.create_user(email="alice@example.com")
        org = Organization.objects.create(name="Acme")
        m = OrganizationMembership(user=user, organization=org, role="impostor")
        with pytest.raises(ValidationError):
            m.full_clean()
