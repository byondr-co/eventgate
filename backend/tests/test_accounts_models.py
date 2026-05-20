import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
class TestUserModel:
    def test_create_user_with_email(self) -> None:
        user = User.objects.create_user(email="alice@example.com")
        assert user.email == "alice@example.com"
        assert user.is_active is True
        assert user.is_staff is False
        assert user.is_superuser is False
        assert not user.has_usable_password()

    def test_create_user_normalizes_email(self) -> None:
        user = User.objects.create_user(email="ALICE@Example.com")
        assert user.email == "alice@example.com"

    def test_create_user_requires_email(self) -> None:
        with pytest.raises(ValueError, match="Email is required"):
            User.objects.create_user(email="")

    def test_create_superuser(self) -> None:
        admin = User.objects.create_superuser(email="root@example.com", password="strong")
        assert admin.is_staff is True
        assert admin.is_superuser is True
        assert admin.check_password("strong")

    def test_email_is_unique(self) -> None:
        from django.db import IntegrityError

        User.objects.create_user(email="bob@example.com")
        with pytest.raises(IntegrityError):
            User.objects.create_user(email="bob@example.com")

    def test_username_field_is_email(self) -> None:
        assert User.USERNAME_FIELD == "email"
        assert "email" not in User.REQUIRED_FIELDS

    def test_str_returns_email(self) -> None:
        user = User.objects.create_user(email="carol@example.com")
        assert str(user) == "carol@example.com"
