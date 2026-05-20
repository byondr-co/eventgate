# Plan B — Accounts, Orgs, Memberships, Magic-link Login

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user accounts, organizations, memberships, magic-link authentication, and the first authenticated dashboard route on top of the Plan A foundation. This is **Plan B of an 8-plan Phase 1 sequence** (see brief §12).

**Architecture:** Custom `User` model (email-only, no password at MVP — magic-link login only). `Organization` + `OrganizationMembership` define the tenant boundary; every later app's tenant-scoped model will inherit `OrgScopedModel` from `apps.common`. Magic-link tokens are random, hashed-at-rest, single-use, 15-minute TTL. Successful login returns a JWT in an httpOnly cookie. Email delivery uses Django's console backend at MVP (magic links land in Fly logs); real email is wired in Plan C alongside QR delivery.

**Tech Stack:** Django 5 + DRF (existing), `djangorestframework-simplejwt` for JWT, `django-allauth`-free (custom magic-link), `python-slugify` for org slugs, bcrypt for token hashing. Next.js 14 App Router (existing) + TanStack Query + shadcn/ui Form components.

**Builds on:** Plan A repo at github.com/vineidev/eventgate. Backend deployed to https://eventgate-backend-staging.fly.dev. Frontend at https://frontend-five-lovat-94.vercel.app.

---

## File Structure

```text
backend/
├── apps/
│   ├── common/
│   │   ├── models.py            ← NEW: OrgScopedModel abstract, OrgScopedQuerySet manager
│   │   ├── permissions.py       ← NEW: IsOrgMember, HasOrgRole
│   │   ├── middleware.py        ← NEW: OrgContextMiddleware
│   │   └── tokens.py            ← NEW: generate_token, hash_token
│   ├── accounts/                ← NEW APP
│   │   ├── __init__.py
│   │   ├── apps.py
│   │   ├── models.py            ← User, MagicLinkToken
│   │   ├── managers.py          ← UserManager (email-based)
│   │   ├── serializers.py
│   │   ├── views.py             ← magic-link request/consume, me, logout
│   │   ├── urls.py
│   │   ├── admin.py
│   │   ├── services.py          ← MagicLinkService (creation, validation, send)
│   │   └── migrations/
│   └── orgs/                    ← NEW APP
│       ├── __init__.py
│       ├── apps.py
│       ├── models.py            ← Organization, OrganizationMembership, Invite
│       ├── serializers.py
│       ├── views.py             ← OrgViewSet, MemberViewSet, InviteViewSet, AcceptInviteView
│       ├── urls.py
│       ├── admin.py
│       ├── services.py          ← InviteService
│       └── migrations/
├── config/
│   ├── settings/
│   │   ├── base.py              ← MODIFY: add apps, AUTH_USER_MODEL, JWT settings, EMAIL_BACKEND
│   │   └── prod.py              ← MODIFY: real email backend hook (kept noop until Plan C)
│   └── urls.py                  ← MODIFY: include accounts + orgs URLs
└── tests/
    ├── conftest.py              ← MODIFY: add user/org fixtures
    ├── test_common_permissions.py
    ├── test_common_middleware.py
    ├── test_accounts_models.py
    ├── test_magic_link_flow.py
    ├── test_orgs_models.py
    ├── test_orgs_endpoints.py
    └── test_invites_flow.py

frontend/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx           ← NEW: minimal auth-page chrome
│   │   ├── login/page.tsx       ← NEW: magic-link request form
│   │   ├── auth/callback/page.tsx ← NEW: consume magic link
│   │   └── invites/[token]/page.tsx ← NEW: accept invite
│   ├── (app)/
│   │   ├── layout.tsx           ← NEW: auth-required shell, sidebar
│   │   ├── page.tsx             ← NEW: org list / switcher
│   │   └── orgs/
│   │       ├── new/page.tsx     ← NEW: create-org form
│   │       └── [slug]/
│   │           ├── page.tsx     ← NEW: org dashboard placeholder
│   │           └── members/page.tsx ← NEW: members + invite form
│   ├── page.tsx                 ← MODIFY: redirect to /login or /(app)
│   └── middleware.ts            ← NEW: route-guard middleware
├── lib/
│   ├── auth.ts                  ← MODIFY: client-side auth helpers, hooks
│   └── orgs.ts                  ← NEW: orgs API client + hooks
└── components/
    ├── auth/
    │   ├── login-form.tsx       ← NEW
    │   └── auth-callback.tsx    ← NEW
    └── orgs/
        ├── org-list.tsx         ← NEW
        ├── create-org-form.tsx  ← NEW
        └── members-table.tsx    ← NEW
```

**Boundary notes:**
- `apps.common` is the foundation every other app depends on. Keep it ruthlessly small — no business logic, only cross-cutting infrastructure.
- `apps.accounts` owns `User` and authentication. `apps.orgs` owns tenancy. No circular imports — `accounts` does not import from `orgs`; `orgs` may import `User` only via `settings.AUTH_USER_MODEL`.
- All tenant-scoped models in later plans (`apps.events.Event`, `apps.guests.Guest`, etc.) inherit `apps.common.models.OrgScopedModel`.
- Frontend `lib/auth.ts` is the only place that touches cookies/session. Components consume `useAuth()` hook.

---

## Task 1: Add SimpleJWT + dependencies, AUTH_USER_MODEL placeholder

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/config/settings/base.py`

- [ ] **Step 1: Add new Python dependencies**

Open `/Users/vinei/Projects/eventgate/backend/pyproject.toml` and add to `dependencies`:

```toml
  "djangorestframework-simplejwt>=5.3,<6.0",
  "python-slugify>=8.0,<9.0",
  "bcrypt>=4.2,<5.0",
```

- [ ] **Step 2: Sync deps**

Run:

```bash
cd /Users/vinei/Projects/eventgate/backend
uv sync
```

Expected: lockfile updated, deps installed.

- [ ] **Step 3: Wire JWT + email settings into base.py**

Append to `/Users/vinei/Projects/eventgate/backend/config/settings/base.py`:

```python
# Auth
AUTH_USER_MODEL = "accounts.User"

# Console email backend at MVP — magic links print to logs. Real email in Plan C.
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Eventgate <noreply@eventgate.dev>")

# SimpleJWT
from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# Cookie-based JWT
JWT_ACCESS_COOKIE = "eventgate_access"
JWT_REFRESH_COOKIE = "eventgate_refresh"
JWT_COOKIE_SECURE = env.bool("JWT_COOKIE_SECURE", default=False)
JWT_COOKIE_SAMESITE = env("JWT_COOKIE_SAMESITE", default="Lax")
JWT_COOKIE_DOMAIN = env("JWT_COOKIE_DOMAIN", default=None)

# Magic-link
MAGIC_LINK_TTL_MINUTES = 15
MAGIC_LINK_FRONTEND_URL = env("MAGIC_LINK_FRONTEND_URL", default="http://localhost:3000")

# Invites
INVITE_TTL_HOURS = 72
```

Also update `INSTALLED_APPS` to add the two new apps and the JWT blacklist app:

Replace the `INSTALLED_APPS = [...]` block with:

```python
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "apps.common",
    "apps.accounts",
    "apps.orgs",
]
```

Also add JWT auth class to `REST_FRAMEWORK`:

Replace the existing `REST_FRAMEWORK = {...}` block with:

```python
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_PARSER_CLASSES": ("rest_framework.parsers.JSONParser",),
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.accounts.authentication.CookieJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
}
```

- [ ] **Step 4: Verify settings still parse**

Run:

```bash
cd /Users/vinei/Projects/eventgate/backend
DJANGO_SETTINGS_MODULE=config.settings.dev uv run python -c "
import django; django.setup()
from django.conf import settings
print('AUTH_USER_MODEL:', settings.AUTH_USER_MODEL)
print('JWT_ACCESS_COOKIE:', settings.JWT_ACCESS_COOKIE)
"
```

Expected: an import error mentioning `apps.accounts` — that's fine, we haven't created it yet. The settings parse but Django's `setup()` fails because the app is missing. Skip this verification; we'll do it after Task 2.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/pyproject.toml backend/uv.lock backend/config/settings/base.py
git commit -m "feat(backend): add SimpleJWT, slugify, bcrypt deps; wire AUTH_USER_MODEL"
```

---

## Task 2: Create `apps.accounts` skeleton + UserManager

**Files:**
- Create: `backend/apps/accounts/__init__.py`
- Create: `backend/apps/accounts/apps.py`
- Create: `backend/apps/accounts/managers.py`

- [ ] **Step 1: Make the package**

```bash
mkdir -p /Users/vinei/Projects/eventgate/backend/apps/accounts/migrations
touch /Users/vinei/Projects/eventgate/backend/apps/accounts/__init__.py
touch /Users/vinei/Projects/eventgate/backend/apps/accounts/migrations/__init__.py
```

- [ ] **Step 2: Write the AppConfig**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/apps.py`:

```python
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    label = "accounts"
```

- [ ] **Step 3: Write the UserManager**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/managers.py`:

```python
from __future__ import annotations

from typing import Any

from django.contrib.auth.base_user import BaseUserManager


class UserManager(BaseUserManager):
    """Email-keyed user manager. No username, no password by default (magic-link only)."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None = None, **extra_fields: Any):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields: Any):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None = None, **extra_fields: Any):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/accounts/
git commit -m "feat(accounts): scaffold app with email-based UserManager"
```

---

## Task 3: User model (TDD)

**Files:**
- Create: `backend/apps/accounts/models.py`
- Create: `backend/tests/test_accounts_models.py`

- [ ] **Step 1: Write the failing test**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_accounts_models.py`:

```python
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
```

- [ ] **Step 2: Run test, see it fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_accounts_models.py -v
```

Expected: errors with `Cannot import name 'User' from 'apps.accounts.models'` or similar.

- [ ] **Step 3: Implement the User model**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/models.py`:

```python
from __future__ import annotations

import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.accounts.managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """Email-keyed user. No password by default — magic-link login at MVP."""

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
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        ordering = ("email",)

    def __str__(self) -> str:
        return self.email
```

- [ ] **Step 4: Create the migration**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py makemigrations accounts
```

Expected: `Migrations for 'accounts': accounts/migrations/0001_initial.py — Create model User`.

- [ ] **Step 5: Apply migrations locally**

(Postgres must be running via `docker compose up -d`.)

```bash
docker compose ps
uv run python manage.py migrate
```

Expected: migrations apply cleanly (including the new accounts.0001).

- [ ] **Step 6: Run the test, see it pass**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_accounts_models.py -v
```

Expected: `7 passed`.

- [ ] **Step 7: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/accounts/models.py backend/apps/accounts/migrations/ backend/tests/test_accounts_models.py
git commit -m "feat(accounts): add custom email-only User model with TDD"
```

---

## Task 4: Token helpers in `apps.common.tokens`

**Files:**
- Create: `backend/apps/common/tokens.py`
- Create: `backend/tests/test_common_tokens.py`

- [ ] **Step 1: Write the failing test**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_common_tokens.py`:

```python
from apps.common.tokens import generate_token, hash_token, tokens_match


def test_generate_token_is_long_random() -> None:
    t1 = generate_token()
    t2 = generate_token()
    assert t1 != t2
    assert len(t1) >= 43  # 32 bytes urlsafe-base64-encoded
    assert all(c.isalnum() or c in "-_" for c in t1)


def test_hash_token_is_deterministic_per_input() -> None:
    raw = "abcdef"
    h1 = hash_token(raw)
    h2 = hash_token(raw)
    assert h1 == h2
    assert h1 != raw


def test_hash_differs_per_input() -> None:
    assert hash_token("a") != hash_token("b")


def test_tokens_match_with_constant_time_compare() -> None:
    raw = generate_token()
    stored = hash_token(raw)
    assert tokens_match(raw, stored)
    assert not tokens_match(raw + "x", stored)
    assert not tokens_match("", stored)
```

- [ ] **Step 2: Run test, see it fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_common_tokens.py -v
```

Expected: import error.

- [ ] **Step 3: Implement token helpers**

Create `/Users/vinei/Projects/eventgate/backend/apps/common/tokens.py`:

```python
"""Small token utilities used by magic-link and invite flows.

Tokens are 32 random bytes encoded urlsafe-base64. We store SHA-256 of the
token in the database so a DB leak doesn't expose live tokens. SHA-256 is
deterministic and fast (the tokens are already high-entropy; bcrypt is
overkill here).
"""
from __future__ import annotations

import hashlib
import hmac
import secrets


def generate_token() -> str:
    """Return a 32-byte urlsafe random token (~43 chars)."""
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    """Return the hex SHA-256 of the token. Deterministic; constant-time-compared via tokens_match."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def tokens_match(raw: str, stored_hash: str) -> bool:
    """Constant-time compare. Returns False on empty raw."""
    if not raw:
        return False
    return hmac.compare_digest(hash_token(raw), stored_hash)
```

- [ ] **Step 4: Run test, see it pass**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_common_tokens.py -v
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/common/tokens.py backend/tests/test_common_tokens.py
git commit -m "feat(common): add token generation + SHA-256 hashing helpers"
```

---

## Task 5: MagicLinkToken model + service (TDD)

**Files:**
- Modify: `backend/apps/accounts/models.py`
- Create: `backend/apps/accounts/services.py`
- Create: `backend/tests/test_magic_link_service.py`

- [ ] **Step 1: Write the failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_magic_link_service.py`:

```python
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import MagicLinkToken
from apps.accounts.services import (
    MagicLinkExpired,
    MagicLinkInvalid,
    consume_magic_link,
    issue_magic_link,
)


@pytest.mark.django_db
class TestIssueMagicLink:
    def test_creates_db_row_and_returns_raw_token(self) -> None:
        raw, token = issue_magic_link(email="alice@example.com")
        assert raw  # raw token returned only once
        assert len(raw) >= 43
        # Stored row exists; the stored hash is NOT the raw token
        assert MagicLinkToken.objects.filter(id=token.id).exists()
        assert token.token_hash != raw

    def test_normalizes_email(self) -> None:
        _, token = issue_magic_link(email="ALICE@Example.com")
        assert token.email == "alice@example.com"

    def test_sets_expiry_15_minutes_from_now(self) -> None:
        before = timezone.now()
        _, token = issue_magic_link(email="alice@example.com")
        after = timezone.now()
        delta = token.expires_at - before
        assert timedelta(minutes=14, seconds=55) < delta < timedelta(minutes=15, seconds=5)
        assert token.expires_at > after

    def test_rate_limit_per_email(self) -> None:
        # Issuing many tokens for the same email creates new rows
        for _ in range(3):
            issue_magic_link(email="alice@example.com")
        assert MagicLinkToken.objects.filter(email="alice@example.com").count() == 3


@pytest.mark.django_db
class TestConsumeMagicLink:
    def test_valid_unused_token_returns_user(self) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        user = consume_magic_link(raw)
        assert user.email == "alice@example.com"

    def test_creates_user_if_not_exists(self) -> None:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        assert not User.objects.filter(email="newbie@example.com").exists()
        raw, _ = issue_magic_link(email="newbie@example.com")
        user = consume_magic_link(raw)
        assert user.email == "newbie@example.com"
        assert User.objects.filter(email="newbie@example.com").exists()

    def test_reuses_existing_user_if_exists(self) -> None:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        existing = User.objects.create_user(email="alice@example.com", full_name="Alice A.")
        raw, _ = issue_magic_link(email="alice@example.com")
        user = consume_magic_link(raw)
        assert user.id == existing.id

    def test_token_is_single_use(self) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        consume_magic_link(raw)
        with pytest.raises(MagicLinkInvalid):
            consume_magic_link(raw)

    def test_expired_token_rejected(self) -> None:
        raw, token = issue_magic_link(email="alice@example.com")
        token.expires_at = timezone.now() - timedelta(seconds=1)
        token.save(update_fields=["expires_at"])
        with pytest.raises(MagicLinkExpired):
            consume_magic_link(raw)

    def test_unknown_token_rejected(self) -> None:
        with pytest.raises(MagicLinkInvalid):
            consume_magic_link("not-a-real-token")
```

- [ ] **Step 2: Run, see fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_magic_link_service.py -v
```

Expected: import errors.

- [ ] **Step 3: Add MagicLinkToken to models.py**

Append to `/Users/vinei/Projects/eventgate/backend/apps/accounts/models.py`:

```python
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
        indexes = [models.Index(fields=["email", "expires_at"])]

    def __str__(self) -> str:
        return f"MagicLink<{self.email}>"

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None
```

- [ ] **Step 4: Implement the service**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/services.py`:

```python
"""Magic-link lifecycle: issue, send, consume."""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import MagicLinkToken
from apps.common.tokens import generate_token, hash_token, tokens_match

User = get_user_model()


class MagicLinkError(Exception):
    """Base."""


class MagicLinkInvalid(MagicLinkError):
    pass


class MagicLinkExpired(MagicLinkError):
    pass


def issue_magic_link(*, email: str, requested_from_ip: str | None = None) -> tuple[str, MagicLinkToken]:
    """Create a fresh magic-link token and return (raw_token, db_row).

    The raw token is shown to the user (via email) exactly once. Only the hash
    persists.
    """
    email_normalized = email.strip().lower()
    raw = generate_token()
    token = MagicLinkToken.objects.create(
        email=email_normalized,
        token_hash=hash_token(raw),
        expires_at=timezone.now() + timedelta(minutes=settings.MAGIC_LINK_TTL_MINUTES),
        requested_from_ip=requested_from_ip,
    )
    return raw, token


def send_magic_link_email(*, email: str, raw_token: str) -> None:
    """Send the magic-link email. Uses the configured EMAIL_BACKEND.

    At MVP this is the console backend; the link prints to stdout / Fly logs.
    Plan C replaces with Resend.
    """
    link = f"{settings.MAGIC_LINK_FRONTEND_URL}/auth/callback?token={raw_token}"
    send_mail(
        subject="Sign in to Eventgate",
        message=(
            "Click the link below to sign in. It works once and expires in 15 minutes.\n\n"
            f"{link}\n\n"
            "If you didn't request this, you can ignore the email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )


@transaction.atomic
def consume_magic_link(raw_token: str) -> "User":
    """Validate and consume a magic-link token, returning the (possibly-new) user."""
    if not raw_token:
        raise MagicLinkInvalid("Empty token")

    token_hash = hash_token(raw_token)
    try:
        token = MagicLinkToken.objects.select_for_update().get(token_hash=token_hash)
    except MagicLinkToken.DoesNotExist as exc:
        raise MagicLinkInvalid("Unknown token") from exc

    if not tokens_match(raw_token, token.token_hash):
        # Defense in depth — get() already matched by hash, but verify anyway
        raise MagicLinkInvalid("Token mismatch")

    if token.is_consumed:
        raise MagicLinkInvalid("Token already used")

    if token.expires_at <= timezone.now():
        raise MagicLinkExpired("Token expired")

    user, _created = User.objects.get_or_create(email=token.email)
    user.last_login_at = timezone.now()
    user.save(update_fields=["last_login_at", "updated_at"])

    token.consumed_at = timezone.now()
    token.save(update_fields=["consumed_at"])

    return user
```

- [ ] **Step 5: Make migrations and apply**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py makemigrations accounts
uv run python manage.py migrate
```

Expected: new migration `0002_magiclinktoken.py` applied.

- [ ] **Step 6: Run tests, see pass**

```bash
uv run pytest tests/test_magic_link_service.py -v
```

Expected: `10 passed`.

- [ ] **Step 7: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/accounts/ backend/tests/test_magic_link_service.py
git commit -m "feat(accounts): add MagicLinkToken model + issue/consume service (TDD)"
```

---

## Task 6: CookieJWTAuthentication

**Files:**
- Create: `backend/apps/accounts/authentication.py`
- Create: `backend/tests/test_cookie_jwt_auth.py`

- [ ] **Step 1: Write the failing test**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_cookie_jwt_auth.py`:

```python
import pytest
from django.urls import path
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.authentication import CookieJWTAuthentication


class _Echo(APIView):
    authentication_classes = (CookieJWTAuthentication,)

    def get(self, request):
        return Response({"email": request.user.email})


# Local URLconf for tests
urlpatterns = [path("echo/", _Echo.as_view())]


@pytest.fixture
def url_override(settings):
    settings.ROOT_URLCONF = __name__


@pytest.mark.django_db
class TestCookieJWTAuthentication:
    def test_authenticates_via_access_cookie(self, url_override, settings, django_user_model):
        user = django_user_model.objects.create_user(email="alice@example.com")
        access = str(RefreshToken.for_user(user).access_token)

        client = APIClient()
        client.cookies[settings.JWT_ACCESS_COOKIE] = access
        response = client.get("/echo/")
        assert response.status_code == 200
        assert response.json() == {"email": "alice@example.com"}

    def test_no_cookie_returns_401(self, url_override):
        client = APIClient()
        response = client.get("/echo/")
        assert response.status_code == 401

    def test_invalid_cookie_returns_401(self, url_override, settings):
        client = APIClient()
        client.cookies[settings.JWT_ACCESS_COOKIE] = "not-a-jwt"
        response = client.get("/echo/")
        assert response.status_code == 401

    def test_authorization_header_still_works(self, url_override, django_user_model):
        user = django_user_model.objects.create_user(email="bob@example.com")
        access = str(RefreshToken.for_user(user).access_token)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = client.get("/echo/")
        assert response.status_code == 200
```

- [ ] **Step 2: Run, fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_cookie_jwt_auth.py -v
```

Expected: import error.

- [ ] **Step 3: Implement CookieJWTAuthentication**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/authentication.py`:

```python
"""DRF authentication class that reads JWT from an httpOnly cookie.

Falls back to the Authorization header (so curl + tests with .credentials()
keep working).
"""
from __future__ import annotations

from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    """Auth via cookie first, then Authorization header."""

    def authenticate(self, request: Request):
        raw = request.COOKIES.get(settings.JWT_ACCESS_COOKIE)
        if raw:
            try:
                validated = self.get_validated_token(raw)
            except (InvalidToken, TokenError) as exc:
                raise AuthenticationFailed("Invalid token") from exc
            return self.get_user(validated), validated
        # Fall back to header
        return super().authenticate(request)
```

- [ ] **Step 4: Run, pass**

```bash
uv run pytest tests/test_cookie_jwt_auth.py -v
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/accounts/authentication.py backend/tests/test_cookie_jwt_auth.py
git commit -m "feat(accounts): add CookieJWTAuthentication with header fallback (TDD)"
```

---

## Task 7: Auth endpoints — request, consume, me, logout (TDD)

**Files:**
- Create: `backend/apps/accounts/serializers.py`
- Create: `backend/apps/accounts/views.py`
- Create: `backend/apps/accounts/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/tests/test_auth_endpoints.py`

- [ ] **Step 1: Write the failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_auth_endpoints.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import MagicLinkToken
from apps.accounts.services import issue_magic_link


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.mark.django_db
class TestRequestMagicLink:
    def test_request_creates_token_and_returns_204(self, client) -> None:
        response = client.post("/api/v1/auth/magic-link/request/", {"email": "alice@example.com"}, format="json")
        assert response.status_code == 204
        assert MagicLinkToken.objects.filter(email="alice@example.com").count() == 1

    def test_request_does_not_leak_user_existence(self, client) -> None:
        # Whether the user exists or not, the response is the same
        r1 = client.post("/api/v1/auth/magic-link/request/", {"email": "newbie@example.com"}, format="json")
        r2 = client.post("/api/v1/auth/magic-link/request/", {"email": "newbie@example.com"}, format="json")
        assert r1.status_code == r2.status_code == 204

    def test_request_rejects_missing_email(self, client) -> None:
        response = client.post("/api/v1/auth/magic-link/request/", {}, format="json")
        assert response.status_code == 400

    def test_request_rejects_invalid_email(self, client) -> None:
        response = client.post("/api/v1/auth/magic-link/request/", {"email": "not-an-email"}, format="json")
        assert response.status_code == 400


@pytest.mark.django_db
class TestConsumeMagicLink:
    def test_consume_returns_user_and_sets_cookies(self, client, settings) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        response = client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")
        assert response.status_code == 200
        body = response.json()
        assert body["user"]["email"] == "alice@example.com"
        # Cookies set
        assert settings.JWT_ACCESS_COOKIE in response.cookies
        assert settings.JWT_REFRESH_COOKIE in response.cookies
        # httpOnly
        assert response.cookies[settings.JWT_ACCESS_COOKIE]["httponly"] is True

    def test_consume_invalid_token_returns_400(self, client) -> None:
        response = client.post("/api/v1/auth/magic-link/consume/", {"token": "garbage"}, format="json")
        assert response.status_code == 400

    def test_consume_used_token_returns_400(self, client) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")
        response = client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")
        assert response.status_code == 400


@pytest.mark.django_db
class TestMeEndpoint:
    def test_authenticated_user_gets_profile(self, client, settings) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")
        response = client.get("/api/v1/auth/me/")
        assert response.status_code == 200
        assert response.json()["email"] == "alice@example.com"

    def test_unauthenticated_returns_401(self, client) -> None:
        response = client.get("/api/v1/auth/me/")
        assert response.status_code == 401


@pytest.mark.django_db
class TestLogout:
    def test_logout_clears_cookies(self, client, settings) -> None:
        raw, _ = issue_magic_link(email="alice@example.com")
        client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")

        response = client.post("/api/v1/auth/logout/")
        assert response.status_code == 204
        # Cookies cleared (empty value)
        assert response.cookies[settings.JWT_ACCESS_COOKIE].value == ""
        assert response.cookies[settings.JWT_REFRESH_COOKIE].value == ""
```

- [ ] **Step 2: Run, see fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_auth_endpoints.py -v
```

Expected: 404s or URL not found.

- [ ] **Step 3: Write serializers**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/serializers.py`:

```python
from rest_framework import serializers

from apps.accounts.models import User


class MagicLinkRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class MagicLinkConsumeSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=20, max_length=64)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "full_name", "created_at", "last_login_at")
        read_only_fields = ("id", "email", "created_at", "last_login_at")
```

- [ ] **Step 4: Write views**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/views.py`:

```python
"""Auth endpoints: request / consume / me / logout."""
from __future__ import annotations

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.serializers import (
    MagicLinkConsumeSerializer,
    MagicLinkRequestSerializer,
    UserSerializer,
)
from apps.accounts.services import (
    MagicLinkError,
    consume_magic_link,
    issue_magic_link,
    send_magic_link_email,
)


def _set_jwt_cookies(response: Response, user) -> Response:
    refresh = RefreshToken.for_user(user)
    access = str(refresh.access_token)
    response.set_cookie(
        settings.JWT_ACCESS_COOKIE,
        access,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        secure=settings.JWT_COOKIE_SECURE,
        httponly=True,
        samesite=settings.JWT_COOKIE_SAMESITE,
        domain=settings.JWT_COOKIE_DOMAIN,
        path="/",
    )
    response.set_cookie(
        settings.JWT_REFRESH_COOKIE,
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        secure=settings.JWT_COOKIE_SECURE,
        httponly=True,
        samesite=settings.JWT_COOKIE_SAMESITE,
        domain=settings.JWT_COOKIE_DOMAIN,
        path="/",
    )
    return response


class MagicLinkRequestView(APIView):
    """POST /api/v1/auth/magic-link/request/  body: {email}"""

    permission_classes = (permissions.AllowAny,)
    authentication_classes: list = []

    def post(self, request: Request) -> Response:
        serializer = MagicLinkRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        ip = request.META.get("REMOTE_ADDR")
        raw, _ = issue_magic_link(email=email, requested_from_ip=ip)
        send_magic_link_email(email=email, raw_token=raw)
        # Always 204 — do not leak whether the email exists
        return Response(status=status.HTTP_204_NO_CONTENT)


class MagicLinkConsumeView(APIView):
    """POST /api/v1/auth/magic-link/consume/  body: {token}"""

    permission_classes = (permissions.AllowAny,)
    authentication_classes: list = []

    def post(self, request: Request) -> Response:
        serializer = MagicLinkConsumeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw = serializer.validated_data["token"]
        try:
            user = consume_magic_link(raw)
        except MagicLinkError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        response = Response({"user": UserSerializer(user).data}, status=status.HTTP_200_OK)
        return _set_jwt_cookies(response, user)


class MeView(APIView):
    """GET /api/v1/auth/me/ — current user."""

    def get(self, request: Request) -> Response:
        return Response(UserSerializer(request.user).data)


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — clear cookies."""

    permission_classes = (permissions.AllowAny,)
    authentication_classes: list = []

    def post(self, request: Request) -> Response:
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.JWT_ACCESS_COOKIE, path="/")
        response.delete_cookie(settings.JWT_REFRESH_COOKIE, path="/")
        return response
```

- [ ] **Step 5: Write URLs**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/urls.py`:

```python
from django.urls import path

from apps.accounts.views import LogoutView, MagicLinkConsumeView, MagicLinkRequestView, MeView

urlpatterns = [
    path("auth/magic-link/request/", MagicLinkRequestView.as_view(), name="magic-link-request"),
    path("auth/magic-link/consume/", MagicLinkConsumeView.as_view(), name="magic-link-consume"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
]
```

- [ ] **Step 6: Wire into config/urls.py**

Edit `/Users/vinei/Projects/eventgate/backend/config/urls.py` and add the accounts include. Replace the existing `urlpatterns = [...]` block with:

```python
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/", include("apps.common.urls")),
    path("api/v1/", include("apps.accounts.urls")),
]
```

- [ ] **Step 7: Run tests, expect pass**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_auth_endpoints.py -v
```

Expected: `11 passed`.

- [ ] **Step 8: Manual smoke test**

In one terminal:

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py runserver 8000
```

In another:

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/magic-link/request/ \
  -H 'Content-Type: application/json' -d '{"email":"alice@example.com"}' -i | head -5
```

Expected: `HTTP/1.1 204 No Content` and the runserver terminal prints an email with a magic link.

Copy the token from the printed link and:

```bash
TOKEN="<paste the token>"
curl -s -c /tmp/cookies.txt -X POST http://localhost:8000/api/v1/auth/magic-link/consume/ \
  -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}"
echo
curl -s -b /tmp/cookies.txt http://localhost:8000/api/v1/auth/me/ | python3 -m json.tool
```

Expected: consume returns `{"user":{...}}` with the user data; `me` returns the same user.

Kill the runserver.

- [ ] **Step 9: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/accounts/ backend/config/urls.py backend/tests/test_auth_endpoints.py
git commit -m "feat(accounts): add magic-link request/consume + me/logout endpoints (TDD)"
```

---

## Task 8: `apps.orgs` skeleton + Organization model (TDD)

**Files:**
- Create: `backend/apps/orgs/__init__.py`, `apps.py`, `migrations/__init__.py`
- Create: `backend/apps/orgs/models.py`
- Create: `backend/tests/test_orgs_models.py`

- [ ] **Step 1: Skeleton**

```bash
mkdir -p /Users/vinei/Projects/eventgate/backend/apps/orgs/migrations
touch /Users/vinei/Projects/eventgate/backend/apps/orgs/__init__.py
touch /Users/vinei/Projects/eventgate/backend/apps/orgs/migrations/__init__.py
```

Create `/Users/vinei/Projects/eventgate/backend/apps/orgs/apps.py`:

```python
from django.apps import AppConfig


class OrgsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.orgs"
    label = "orgs"
```

- [ ] **Step 2: Write the failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_orgs_models.py`:

```python
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
        # When using the convenience helper that handles collisions
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
```

- [ ] **Step 3: Run, see fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_orgs_models.py -v
```

Expected: ImportError on `apps.orgs.models`.

- [ ] **Step 4: Implement models**

Create `/Users/vinei/Projects/eventgate/backend/apps/orgs/models.py`:

```python
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from slugify import slugify


class OrganizationManager(models.Manager):
    def create_with_unique_slug(self, *, name: str, **extra) -> "Organization":
        base = slugify(name) or "org"
        candidate = base
        n = 0
        while self.filter(slug=candidate).exists():
            n += 1
            candidate = f"{base}-{n}"
        return self.create(name=name, slug=candidate, **extra)


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

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name) or "org"
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class OrganizationMembership(models.Model):
    """User ↔ Organization with a role. One row per (user, org)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=16, choices=Organization.ROLES, default="staff")
    is_active = models.BooleanField(default=True)
    invited_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("user", "organization"), name="unique_user_per_org"),
        ]
        ordering = ("organization__name", "user__email")

    def __str__(self) -> str:
        return f"{self.user.email} @ {self.organization.name} ({self.role})"
```

- [ ] **Step 5: Migrate**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py makemigrations orgs
uv run python manage.py migrate
```

Expected: `orgs/migrations/0001_initial.py` created and applied.

- [ ] **Step 6: Run tests, pass**

```bash
uv run pytest tests/test_orgs_models.py -v
```

Expected: `8 passed`.

- [ ] **Step 7: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/orgs/ backend/tests/test_orgs_models.py
git commit -m "feat(orgs): add Organization + OrganizationMembership models (TDD)"
```

---

## Task 9: `OrgScopedModel` abstract base + `IsOrgMember` permission (TDD)

**Files:**
- Create: `backend/apps/common/models.py`
- Create: `backend/apps/common/permissions.py`
- Create: `backend/tests/test_common_orgscoped.py`

- [ ] **Step 1: Write the failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_common_orgscoped.py`:

```python
import pytest
from django.contrib.auth import get_user_model
from django.urls import path
from rest_framework import permissions, viewsets
from rest_framework.response import Response
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.common.permissions import IsOrgMember
from apps.orgs.models import Organization, OrganizationMembership

User = get_user_model()


class _OrgScopedView(viewsets.ViewSet):
    permission_classes = (permissions.IsAuthenticated, IsOrgMember)

    def list(self, request, org_slug=None):
        # IsOrgMember sets request.organization
        return Response({"org": request.organization.slug, "role": request.org_role})


urlpatterns = [
    path("orgs/<slug:org_slug>/echo/", _OrgScopedView.as_view({"get": "list"})),
]


@pytest.fixture
def url_override(settings):
    settings.ROOT_URLCONF = __name__


def _login(client, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.mark.django_db
class TestIsOrgMember:
    def test_member_can_access(self, url_override) -> None:
        user = User.objects.create_user(email="alice@example.com")
        org = Organization.objects.create(name="Acme", slug="acme")
        OrganizationMembership.objects.create(user=user, organization=org, role="admin")

        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/orgs/acme/echo/")
        assert response.status_code == 200
        assert response.json() == {"org": "acme", "role": "admin"}

    def test_non_member_gets_404(self, url_override) -> None:
        User.objects.create_user(email="alice@example.com")
        Organization.objects.create(name="Acme", slug="acme")
        # alice is NOT a member

        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/orgs/acme/echo/")
        # 404 (not 403) — do not reveal that the org exists
        assert response.status_code == 404

    def test_unauthenticated_gets_401(self, url_override) -> None:
        Organization.objects.create(name="Acme", slug="acme")
        client = APIClient()
        response = client.get("/orgs/acme/echo/")
        assert response.status_code == 401

    def test_inactive_membership_blocked(self, url_override) -> None:
        user = User.objects.create_user(email="alice@example.com")
        org = Organization.objects.create(name="Acme", slug="acme")
        OrganizationMembership.objects.create(user=user, organization=org, role="admin", is_active=False)

        client = APIClient()
        _login(client, "alice@example.com")
        response = client.get("/orgs/acme/echo/")
        assert response.status_code == 404
```

- [ ] **Step 2: Run, fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_common_orgscoped.py -v
```

Expected: ImportError on `apps.common.permissions`.

- [ ] **Step 3: Implement OrgScopedModel base**

Create `/Users/vinei/Projects/eventgate/backend/apps/common/models.py`:

```python
"""Cross-cutting base models.

Every tenant-scoped model in the SaaS inherits OrgScopedModel. The manager
gives a default `.for_org(org)` filter that views should use.
"""
from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class OrgScopedQuerySet(models.QuerySet):
    def for_org(self, org) -> "OrgScopedQuerySet":
        return self.filter(organization=org)


class OrgScopedManager(models.Manager.from_queryset(OrgScopedQuerySet)):
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
```

- [ ] **Step 4: Implement IsOrgMember permission**

Create `/Users/vinei/Projects/eventgate/backend/apps/common/permissions.py`:

```python
"""Permission classes for tenant-scoped views.

Views resolved via URL `<slug:org_slug>` are passed through IsOrgMember which:
  1. Loads the Organization by slug (raises 404 if not found).
  2. Verifies the request user has an active membership in that org.
  3. Sets `request.organization` and `request.org_role` for downstream code.
  4. Returns 404 (not 403) on non-membership to avoid leaking org existence.
"""
from __future__ import annotations

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.orgs.models import Organization, OrganizationMembership


class IsOrgMember(BasePermission):
    message = "Membership required."

    def has_permission(self, request: Request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False

        org_slug = view.kwargs.get("org_slug")
        if not org_slug:
            return False

        # 404 over the org so non-members never learn the org exists
        org = get_object_or_404(Organization, slug=org_slug)
        try:
            membership = OrganizationMembership.objects.get(
                organization=org, user=request.user, is_active=True
            )
        except OrganizationMembership.DoesNotExist as exc:
            raise Http404 from exc

        request.organization = org  # type: ignore[attr-defined]
        request.org_role = membership.role  # type: ignore[attr-defined]
        return True


class HasOrgRole(BasePermission):
    """Composable check: required_roles set on the view as `required_org_roles`."""

    def has_permission(self, request: Request, view) -> bool:
        required = getattr(view, "required_org_roles", None)
        if not required:
            return True
        return getattr(request, "org_role", None) in set(required)
```

- [ ] **Step 5: Run, pass**

```bash
uv run pytest tests/test_common_orgscoped.py -v
```

Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/common/ backend/tests/test_common_orgscoped.py
git commit -m "feat(common): add OrgScopedModel base + IsOrgMember/HasOrgRole permissions (TDD)"
```

---

## Task 10: Org endpoints — list/create/detail (TDD)

**Files:**
- Create: `backend/apps/orgs/serializers.py`
- Create: `backend/apps/orgs/views.py`
- Create: `backend/apps/orgs/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/tests/test_orgs_endpoints.py`

- [ ] **Step 1: Write the failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_orgs_endpoints.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.orgs.models import Organization, OrganizationMembership


def _login(client: APIClient, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.mark.django_db
class TestListOrgs:
    def test_returns_only_orgs_user_is_member_of(self, client) -> None:
        _login(client, "alice@example.com")
        from django.contrib.auth import get_user_model

        User = get_user_model()
        alice = User.objects.get(email="alice@example.com")

        a = Organization.objects.create(name="Alpha", slug="alpha")
        Organization.objects.create(name="Bravo", slug="bravo")  # not a member
        OrganizationMembership.objects.create(user=alice, organization=a, role="owner")

        response = client.get("/api/v1/orgs/")
        assert response.status_code == 200
        slugs = [o["slug"] for o in response.json()["results"]]
        assert slugs == ["alpha"]

    def test_unauth_returns_401(self, client) -> None:
        response = client.get("/api/v1/orgs/")
        assert response.status_code == 401


@pytest.mark.django_db
class TestCreateOrg:
    def test_creates_org_and_makes_user_owner(self, client) -> None:
        _login(client, "alice@example.com")
        response = client.post("/api/v1/orgs/", {"name": "Cambodia Tech"}, format="json")
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Cambodia Tech"
        assert body["slug"] == "cambodia-tech"
        # Alice is now owner
        org = Organization.objects.get(slug="cambodia-tech")
        m = OrganizationMembership.objects.get(organization=org, user__email="alice@example.com")
        assert m.role == "owner"

    def test_slug_collision_appends_suffix(self, client) -> None:
        _login(client, "alice@example.com")
        Organization.objects.create(name="Existing", slug="cambodia-tech")
        response = client.post("/api/v1/orgs/", {"name": "Cambodia Tech"}, format="json")
        assert response.status_code == 201
        assert response.json()["slug"].startswith("cambodia-tech-")


@pytest.mark.django_db
class TestRetrieveOrg:
    def test_member_can_get_detail(self, client) -> None:
        _login(client, "alice@example.com")
        client.post("/api/v1/orgs/", {"name": "Acme"}, format="json")
        response = client.get("/api/v1/orgs/acme/")
        assert response.status_code == 200
        assert response.json()["slug"] == "acme"

    def test_non_member_gets_404(self, client) -> None:
        _login(client, "alice@example.com")
        Organization.objects.create(name="Other", slug="other")
        response = client.get("/api/v1/orgs/other/")
        assert response.status_code == 404
```

- [ ] **Step 2: Run, see fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_orgs_endpoints.py -v
```

Expected: 404s.

- [ ] **Step 3: Write serializers**

Create `/Users/vinei/Projects/eventgate/backend/apps/orgs/serializers.py`:

```python
from rest_framework import serializers

from apps.orgs.models import Organization, OrganizationMembership


class OrganizationSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ("id", "name", "slug", "country_code", "default_timezone", "plan", "created_at", "role")
        read_only_fields = ("id", "slug", "plan", "created_at", "role")

    def get_role(self, obj: Organization) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        m = OrganizationMembership.objects.filter(organization=obj, user=request.user, is_active=True).first()
        return m.role if m else None


class MembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = ("id", "user_email", "user_full_name", "role", "is_active", "accepted_at", "created_at")
        read_only_fields = ("id", "user_email", "user_full_name", "accepted_at", "created_at")
```

- [ ] **Step 4: Write views**

Create `/Users/vinei/Projects/eventgate/backend/apps/orgs/views.py`:

```python
from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.permissions import IsOrgMember
from apps.orgs.models import Organization, OrganizationMembership
from apps.orgs.serializers import OrganizationSerializer


class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class OrganizationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    list   GET    /api/v1/orgs/
    create POST   /api/v1/orgs/
    detail GET    /api/v1/orgs/<slug>/
    """

    serializer_class = OrganizationSerializer
    pagination_class = StandardPagination
    lookup_field = "slug"

    def get_permissions(self):
        if self.action in ("list", "create"):
            return [IsAuthenticated()]
        return [IsAuthenticated(), _MembershipForSlug()]

    def get_queryset(self):
        # Only orgs the current user is a member of
        return Organization.objects.filter(
            memberships__user=self.request.user, memberships__is_active=True
        ).distinct()

    @transaction.atomic
    def perform_create(self, serializer):
        org = Organization.objects.create_with_unique_slug(name=serializer.validated_data["name"])
        OrganizationMembership.objects.create(
            user=self.request.user,
            organization=org,
            role="owner",
            accepted_at=timezone.now(),
        )
        serializer.instance = org


class _MembershipForSlug(IsOrgMember):
    """Adapter: viewset uses `lookup_field=slug`, but IsOrgMember reads `org_slug`."""

    def has_permission(self, request: Request, view) -> bool:
        # Translate the URL kwarg `slug` into the canonical `org_slug` that IsOrgMember expects
        view.kwargs["org_slug"] = view.kwargs.get("slug")
        return super().has_permission(request, view)
```

- [ ] **Step 5: Write URLs**

Create `/Users/vinei/Projects/eventgate/backend/apps/orgs/urls.py`:

```python
from rest_framework.routers import SimpleRouter

from apps.orgs.views import OrganizationViewSet

router = SimpleRouter(trailing_slash=True)
router.register("orgs", OrganizationViewSet, basename="orgs")

urlpatterns = router.urls
```

- [ ] **Step 6: Wire into config/urls.py**

Edit `/Users/vinei/Projects/eventgate/backend/config/urls.py` and add `apps.orgs.urls` include:

Replace the `urlpatterns = [...]` block with:

```python
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/", include("apps.common.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.orgs.urls")),
]
```

- [ ] **Step 7: Run, pass**

```bash
uv run pytest tests/test_orgs_endpoints.py -v
```

Expected: `5 passed`.

- [ ] **Step 8: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/orgs/ backend/config/urls.py backend/tests/test_orgs_endpoints.py
git commit -m "feat(orgs): add list/create/detail endpoints + owner-on-create (TDD)"
```

---

## Task 11: Invite model + send-invite endpoint (TDD)

**Files:**
- Modify: `backend/apps/orgs/models.py`
- Modify: `backend/apps/orgs/serializers.py`
- Create: `backend/apps/orgs/services.py`
- Modify: `backend/apps/orgs/views.py`
- Modify: `backend/apps/orgs/urls.py`
- Create: `backend/tests/test_invites_flow.py`

- [ ] **Step 1: Write the failing tests**

Create `/Users/vinei/Projects/eventgate/backend/tests/test_invites_flow.py`:

```python
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.services import issue_magic_link
from apps.orgs.models import Invite, Organization, OrganizationMembership


def _login(client: APIClient, email: str) -> None:
    raw, _ = issue_magic_link(email=email)
    client.post("/api/v1/auth/magic-link/consume/", {"token": raw}, format="json")


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def acme_with_alice_owner(client):
    _login(client, "alice@example.com")
    client.post("/api/v1/orgs/", {"name": "Acme"}, format="json")
    return Organization.objects.get(slug="acme")


@pytest.mark.django_db
class TestSendInvite:
    def test_owner_can_invite(self, client, acme_with_alice_owner) -> None:
        response = client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        assert response.status_code == 201
        assert Invite.objects.filter(organization=acme_with_alice_owner, email="bob@example.com").exists()

    def test_non_member_cannot_invite(self, client) -> None:
        Organization.objects.create(name="Acme", slug="acme")
        _login(client, "outsider@example.com")
        response = client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        assert response.status_code == 404

    def test_staff_cannot_invite(self, client) -> None:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        _login(client, "alice@example.com")
        alice = User.objects.get(email="alice@example.com")
        org = Organization.objects.create(name="Acme", slug="acme")
        OrganizationMembership.objects.create(user=alice, organization=org, role="staff")
        response = client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        assert response.status_code == 403

    def test_invite_to_existing_member_rejected(self, client, acme_with_alice_owner) -> None:
        # Inviting an email that's already a member returns 400
        response = client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "alice@example.com", "role": "admin"},
            format="json",
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestAcceptInvite:
    def test_recipient_can_accept_after_magic_link(self, client, acme_with_alice_owner) -> None:
        response = client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        invite = Invite.objects.get(email="bob@example.com")

        # Bob logs in via magic-link
        bob_client = APIClient()
        _login(bob_client, "bob@example.com")

        accept = bob_client.post(f"/api/v1/auth/invites/{invite.raw_token_for_test}/accept/")
        assert accept.status_code == 200
        # Bob is now a member
        assert OrganizationMembership.objects.filter(
            organization=acme_with_alice_owner, user__email="bob@example.com", role="admin"
        ).exists()

    def test_accept_with_wrong_email_returns_403(self, client, acme_with_alice_owner) -> None:
        client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        invite = Invite.objects.get(email="bob@example.com")

        wrong = APIClient()
        _login(wrong, "charlie@example.com")
        response = wrong.post(f"/api/v1/auth/invites/{invite.raw_token_for_test}/accept/")
        assert response.status_code == 403

    def test_expired_invite_rejected(self, client, acme_with_alice_owner) -> None:
        from datetime import timedelta

        client.post(
            "/api/v1/orgs/acme/invites/",
            {"email": "bob@example.com", "role": "admin"},
            format="json",
        )
        invite = Invite.objects.get(email="bob@example.com")
        invite.expires_at = timezone.now() - timedelta(seconds=1)
        invite.save()

        bob = APIClient()
        _login(bob, "bob@example.com")
        response = bob.post(f"/api/v1/auth/invites/{invite.raw_token_for_test}/accept/")
        assert response.status_code == 400
```

> Note: tests reference `invite.raw_token_for_test` — this is a test-only attribute set by the service layer so tests can replay the raw token. Real callers receive the raw token by email only.

- [ ] **Step 2: Run, fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_invites_flow.py -v
```

Expected: ImportError on `Invite`.

- [ ] **Step 3: Add Invite model**

Append to `/Users/vinei/Projects/eventgate/backend/apps/orgs/models.py`:

```python
class Invite(models.Model):
    """Email invitation to join an Organization with a specific role.

    Single-use token, 72h TTL, scoped to the recipient email.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="invites")
    email = models.EmailField()
    role = models.CharField(max_length=16, choices=Organization.ROLES, default="staff")
    token_hash = models.CharField(max_length=64, unique=True)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=("organization", "email"))]
        constraints = [
            models.UniqueConstraint(
                fields=("organization", "email"),
                condition=models.Q(accepted_at__isnull=True, revoked_at__isnull=True),
                name="one_open_invite_per_email_per_org",
            ),
        ]

    @property
    def is_active(self) -> bool:
        return self.accepted_at is None and self.revoked_at is None and self.expires_at > timezone.now()

    def __str__(self) -> str:
        return f"Invite<{self.email} → {self.organization.slug}>"
```

Also at the top of models.py, ensure `import uuid` is present (it already is).

- [ ] **Step 4: Write the invite service**

Create `/Users/vinei/Projects/eventgate/backend/apps/orgs/services.py`:

```python
"""Invite lifecycle: send + accept."""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from apps.common.tokens import generate_token, hash_token, tokens_match
from apps.orgs.models import Invite, Organization, OrganizationMembership


class InviteError(Exception):
    pass


class InviteAlreadyMember(InviteError):
    pass


class InviteExpired(InviteError):
    pass


class InviteEmailMismatch(InviteError):
    pass


class InviteInvalid(InviteError):
    pass


@transaction.atomic
def send_invite(*, organization: Organization, email: str, role: str, invited_by) -> Invite:
    email = email.strip().lower()
    # Reject if email already corresponds to an active membership
    if OrganizationMembership.objects.filter(
        organization=organization, user__email=email, is_active=True
    ).exists():
        raise InviteAlreadyMember(email)

    # Revoke any prior open invite for this email/org
    Invite.objects.filter(organization=organization, email=email, accepted_at__isnull=True, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )

    raw = generate_token()
    invite = Invite.objects.create(
        organization=organization,
        email=email,
        role=role,
        token_hash=hash_token(raw),
        invited_by=invited_by,
        expires_at=timezone.now() + timedelta(hours=settings.INVITE_TTL_HOURS),
    )
    invite.raw_token_for_test = raw  # type: ignore[attr-defined]  # for test assertions

    link = f"{settings.MAGIC_LINK_FRONTEND_URL}/invites/{raw}"
    send_mail(
        subject=f"You're invited to {organization.name} on Eventgate",
        message=(
            f"{invited_by.email if invited_by else 'Someone'} invited you to join "
            f"{organization.name} as {role}.\n\nAccept the invite within "
            f"{settings.INVITE_TTL_HOURS} hours:\n\n{link}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )
    return invite


@transaction.atomic
def accept_invite(*, raw_token: str, user) -> OrganizationMembership:
    token_hash = hash_token(raw_token)
    try:
        invite = Invite.objects.select_for_update().get(token_hash=token_hash)
    except Invite.DoesNotExist as exc:
        raise InviteInvalid("Unknown invite") from exc

    if not tokens_match(raw_token, invite.token_hash):
        raise InviteInvalid("Token mismatch")

    if invite.accepted_at is not None:
        raise InviteInvalid("Invite already accepted")

    if invite.revoked_at is not None:
        raise InviteInvalid("Invite revoked")

    if invite.expires_at <= timezone.now():
        raise InviteExpired("Invite expired")

    if user.email.lower() != invite.email.lower():
        raise InviteEmailMismatch(f"Invite is for {invite.email}, not {user.email}")

    membership, _ = OrganizationMembership.objects.update_or_create(
        organization=invite.organization,
        user=user,
        defaults={"role": invite.role, "is_active": True, "accepted_at": timezone.now()},
    )
    invite.accepted_at = timezone.now()
    invite.save(update_fields=["accepted_at"])
    return membership
```

- [ ] **Step 5: Add invite views**

Append to `/Users/vinei/Projects/eventgate/backend/apps/orgs/views.py`:

```python
from rest_framework import serializers as drf_serializers

from apps.common.permissions import HasOrgRole
from apps.orgs.models import Invite
from apps.orgs.services import (
    InviteAlreadyMember,
    InviteEmailMismatch,
    InviteError,
    accept_invite,
    send_invite,
)


class InviteCreateSerializer(drf_serializers.Serializer):
    email = drf_serializers.EmailField()
    role = drf_serializers.ChoiceField(choices=Organization.ROLES)


class InviteSerializer(drf_serializers.ModelSerializer):
    class Meta:
        model = Invite
        fields = ("id", "email", "role", "created_at", "expires_at", "accepted_at")
        read_only_fields = fields


class OrgInviteCreateView(viewsets.GenericViewSet, mixins.CreateModelMixin):
    """POST /api/v1/orgs/<slug>/invites/"""

    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")
    serializer_class = InviteCreateSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            invite = send_invite(
                organization=request.organization,
                email=ser.validated_data["email"],
                role=ser.validated_data["role"],
                invited_by=request.user,
            )
        except InviteAlreadyMember:
            return Response(
                {"detail": "This email is already a member of the organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(InviteSerializer(invite).data, status=status.HTTP_201_CREATED)


class AcceptInviteView(viewsets.GenericViewSet):
    """POST /api/v1/auth/invites/<token>/accept/"""

    permission_classes = (IsAuthenticated,)

    def create(self, request: Request, token: str | None = None) -> Response:
        try:
            membership = accept_invite(raw_token=token or "", user=request.user)
        except InviteEmailMismatch as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except InviteError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "organization": OrganizationSerializer(membership.organization, context={"request": request}).data,
                "role": membership.role,
            },
            status=status.HTTP_200_OK,
        )
```

- [ ] **Step 6: Wire URLs**

Update `/Users/vinei/Projects/eventgate/backend/apps/orgs/urls.py`:

```python
from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.orgs.views import AcceptInviteView, OrganizationViewSet, OrgInviteCreateView

router = SimpleRouter(trailing_slash=True)
router.register("orgs", OrganizationViewSet, basename="orgs")

urlpatterns = router.urls + [
    path("orgs/<slug:org_slug>/invites/", OrgInviteCreateView.as_view({"post": "create"}), name="org-invite-create"),
    path("auth/invites/<str:token>/accept/", AcceptInviteView.as_view({"post": "create"}), name="invite-accept"),
]
```

- [ ] **Step 7: Migrate**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py makemigrations orgs
uv run python manage.py migrate
```

Expected: `orgs/migrations/0002_invite.py` applied.

- [ ] **Step 8: Run, pass**

```bash
uv run pytest tests/test_invites_flow.py -v
```

Expected: `6 passed`.

- [ ] **Step 9: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/orgs/ backend/tests/test_invites_flow.py
git commit -m "feat(orgs): add Invite model + send/accept flow with role gate (TDD)"
```

---

## Task 12: Members list endpoint (TDD)

**Files:**
- Modify: `backend/apps/orgs/views.py`
- Modify: `backend/apps/orgs/urls.py`
- Add test in `backend/tests/test_orgs_endpoints.py`

- [ ] **Step 1: Add failing test**

Append to `/Users/vinei/Projects/eventgate/backend/tests/test_orgs_endpoints.py`:

```python
@pytest.mark.django_db
class TestMembersList:
    def test_owner_sees_all_members(self, client) -> None:
        _login(client, "alice@example.com")
        client.post("/api/v1/orgs/", {"name": "Acme"}, format="json")
        # Invite + accept bob
        client.post("/api/v1/orgs/acme/invites/", {"email": "bob@example.com", "role": "admin"}, format="json")
        from apps.orgs.models import Invite
        invite = Invite.objects.get(email="bob@example.com")
        bob = APIClient()
        _login(bob, "bob@example.com")
        bob.post(f"/api/v1/auth/invites/{invite.raw_token_for_test}/accept/")

        response = client.get("/api/v1/orgs/acme/members/")
        assert response.status_code == 200
        emails = sorted(m["user_email"] for m in response.json()["results"])
        assert emails == ["alice@example.com", "bob@example.com"]

    def test_non_member_gets_404(self, client) -> None:
        _login(client, "outsider@example.com")
        Organization.objects.create(name="Acme", slug="acme")
        response = client.get("/api/v1/orgs/acme/members/")
        assert response.status_code == 404
```

- [ ] **Step 2: Add the view**

Append to `/Users/vinei/Projects/eventgate/backend/apps/orgs/views.py`:

```python
class OrgMembersListView(viewsets.GenericViewSet, mixins.ListModelMixin):
    """GET /api/v1/orgs/<slug>/members/"""

    permission_classes = (IsAuthenticated, IsOrgMember)
    pagination_class = StandardPagination
    serializer_class = MembershipSerializer  # imported below

    def get_queryset(self):
        return OrganizationMembership.objects.filter(
            organization=self.request.organization, is_active=True
        ).select_related("user")
```

Also ensure `MembershipSerializer` is imported at the top of views.py — add to the existing serializer import line:

```python
from apps.orgs.serializers import MembershipSerializer, OrganizationSerializer
```

- [ ] **Step 3: Wire URL**

Update `/Users/vinei/Projects/eventgate/backend/apps/orgs/urls.py`:

```python
from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.orgs.views import AcceptInviteView, OrganizationViewSet, OrgInviteCreateView, OrgMembersListView

router = SimpleRouter(trailing_slash=True)
router.register("orgs", OrganizationViewSet, basename="orgs")

urlpatterns = router.urls + [
    path("orgs/<slug:org_slug>/invites/", OrgInviteCreateView.as_view({"post": "create"}), name="org-invite-create"),
    path("orgs/<slug:org_slug>/members/", OrgMembersListView.as_view({"get": "list"}), name="org-members-list"),
    path("auth/invites/<str:token>/accept/", AcceptInviteView.as_view({"post": "create"}), name="invite-accept"),
]
```

- [ ] **Step 4: Run, pass**

```bash
uv run pytest tests/test_orgs_endpoints.py -v
```

Expected: all org tests pass, including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/orgs/ backend/tests/test_orgs_endpoints.py
git commit -m "feat(orgs): add members list endpoint (TDD)"
```

---

## Task 13: Django admin registrations

**Files:**
- Create: `backend/apps/accounts/admin.py`
- Create: `backend/apps/orgs/admin.py`

- [ ] **Step 1: Register User**

Create `/Users/vinei/Projects/eventgate/backend/apps/accounts/admin.py`:

```python
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.accounts.models import MagicLinkToken, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "full_name", "is_active", "is_staff", "last_login_at")
    search_fields = ("email", "full_name")
    fieldsets = (
        (None, {"fields": ("email", "full_name")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Timestamps", {"fields": ("last_login_at",)}),
    )
    readonly_fields = ("last_login_at",)
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),)


@admin.register(MagicLinkToken)
class MagicLinkTokenAdmin(admin.ModelAdmin):
    list_display = ("email", "created_at", "expires_at", "consumed_at")
    readonly_fields = ("token_hash", "created_at", "consumed_at")
    list_filter = ("consumed_at",)
```

- [ ] **Step 2: Register Organization, Membership, Invite**

Create `/Users/vinei/Projects/eventgate/backend/apps/orgs/admin.py`:

```python
from django.contrib import admin

from apps.orgs.models import Invite, Organization, OrganizationMembership


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "plan", "country_code", "created_at")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "organization", "role", "is_active", "accepted_at")
    list_filter = ("role", "is_active")
    search_fields = ("user__email", "organization__name")


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = ("email", "organization", "role", "expires_at", "accepted_at", "revoked_at")
    list_filter = ("role",)
    search_fields = ("email", "organization__name")
    readonly_fields = ("token_hash", "created_at", "accepted_at", "revoked_at")
```

- [ ] **Step 3: Create superuser locally for verification**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py createsuperuser
```

Enter an email like `admin@example.com` and a password (e.g., `dev-only-admin-password`).

- [ ] **Step 4: Manual smoke test admin**

```bash
uv run python manage.py runserver 8000
```

Open http://localhost:8000/admin/, log in as `admin@example.com`, confirm Users, Organizations, Memberships, Invites, Magic Link Tokens are all visible.

Kill the runserver.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps/accounts/admin.py backend/apps/orgs/admin.py
git commit -m "feat(admin): register User, Organization, Membership, Invite, MagicLinkToken"
```

---

## Task 14: Frontend auth client (`lib/auth.ts`) + `useAuth` hook

**Files:**
- Modify: `frontend/lib/api.ts`
- Replace: `frontend/lib/auth.ts`
- Modify: `frontend/.env.local` and `.env.example`

- [ ] **Step 1: Add `API_BASE` re-export**

Update `/Users/vinei/Projects/eventgate/frontend/lib/api.ts` to export the base URL for other modules:

```ts
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type HealthResponse = {
  status: "ok";
  version: string;
  database: "ok" | "error";
};

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json() as Promise<HealthResponse>;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Write `lib/auth.ts`**

Create `/Users/vinei/Projects/eventgate/frontend/lib/auth.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type User = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  last_login_at: string | null;
};

export const ME_QUERY_KEY = ["me"] as const;

export function useMe() {
  return useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await apiFetch<User>("/api/v1/auth/me/");
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}

export function useRequestMagicLink() {
  return useMutation({
    mutationFn: async (email: string) => {
      await apiFetch<void>("/api/v1/auth/magic-link/request/", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
  });
}

export function useConsumeMagicLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const result = await apiFetch<{ user: User }>("/api/v1/auth/magic-link/consume/", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      return result.user;
    },
    onSuccess: (user) => qc.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiFetch<void>("/api/v1/auth/logout/", { method: "POST" });
    },
    onSuccess: () => qc.setQueryData(ME_QUERY_KEY, null),
  });
}
```

- [ ] **Step 3: Add `orgs` client**

Create `/Users/vinei/Projects/eventgate/frontend/lib/orgs.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  country_code: string;
  default_timezone: string;
  plan: string;
  created_at: string;
  role: "owner" | "admin" | "manager" | "staff" | null;
};

export type Member = {
  id: string;
  user_email: string;
  user_full_name: string;
  role: Organization["role"];
  is_active: boolean;
  accepted_at: string;
  created_at: string;
};

type Paginated<T> = { count: number; results: T[] };

export const ORGS_QUERY_KEY = ["orgs"] as const;

export function useOrgs() {
  return useQuery({
    queryKey: ORGS_QUERY_KEY,
    queryFn: () => apiFetch<Paginated<Organization>>("/api/v1/orgs/"),
  });
}

export function useOrg(slug: string) {
  return useQuery({
    queryKey: ["orgs", slug],
    queryFn: () => apiFetch<Organization>(`/api/v1/orgs/${slug}/`),
    enabled: !!slug,
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<Organization>("/api/v1/orgs/", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORGS_QUERY_KEY }),
  });
}

export function useMembers(slug: string) {
  return useQuery({
    queryKey: ["orgs", slug, "members"],
    queryFn: () => apiFetch<Paginated<Member>>(`/api/v1/orgs/${slug}/members/`),
    enabled: !!slug,
  });
}

export function useSendInvite(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: NonNullable<Organization["role"]> }) =>
      apiFetch<{ id: string; email: string; role: string }>(
        `/api/v1/orgs/${slug}/invites/`,
        { method: "POST", body: JSON.stringify({ email, role }) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs", slug, "members"] }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<{ organization: Organization; role: string }>(
        `/api/v1/auth/invites/${token}/accept/`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORGS_QUERY_KEY }),
  });
}
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/lib/
git commit -m "feat(frontend): add auth + orgs API clients with TanStack Query hooks"
```

---

## Task 15: Frontend route middleware (auth guard)

**Files:**
- Create: `frontend/middleware.ts`

- [ ] **Step 1: Write the middleware**

Create `/Users/vinei/Projects/eventgate/frontend/middleware.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];
const INVITE_PREFIX = "/invites/";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith(INVITE_PREFIX);

  const hasAccess = req.cookies.get("eventgate_access");
  if (!hasAccess && !isPublic) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (hasAccess && pathname === "/login") {
    const home = req.nextUrl.clone();
    home.pathname = "/";
    return NextResponse.redirect(home);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

Expected: build passes; middleware registered.

- [ ] **Step 3: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/middleware.ts
git commit -m "feat(frontend): add route middleware redirecting unauthenticated traffic to /login"
```

---

## Task 16: Login page

**Files:**
- Create: `frontend/app/(auth)/layout.tsx`
- Create: `frontend/app/(auth)/login/page.tsx`
- Create: `frontend/components/auth/login-form.tsx`

- [ ] **Step 1: Auth route-group layout**

Create `/Users/vinei/Projects/eventgate/frontend/app/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
```

- [ ] **Step 2: Login form**

Create `/Users/vinei/Projects/eventgate/frontend/components/auth/login-form.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequestMagicLink } from "@/lib/auth";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const request = useRequestMagicLink();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await request.mutateAsync(email);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Didn&apos;t arrive? Check spam, then try again.
          </p>
          <Button
            variant="link"
            className="px-0"
            onClick={() => {
              setSubmitted(false);
              setEmail("");
            }}
          >
            Use a different email
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to Eventgate</CardTitle>
        <CardDescription>Enter your email — we&apos;ll send a one-time link.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" className="w-full" disabled={request.isPending || !email}>
            {request.isPending ? "Sending…" : "Send sign-in link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Login page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(auth)/login/page.tsx`:

```tsx
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return <LoginForm />;
}
```

- [ ] **Step 4: Build check**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/app/\(auth\)/ frontend/components/auth/login-form.tsx
git commit -m "feat(frontend): add /login page with magic-link request form"
```

---

## Task 17: Auth-callback page

**Files:**
- Create: `frontend/app/(auth)/auth/callback/page.tsx`
- Create: `frontend/components/auth/auth-callback.tsx`

- [ ] **Step 1: Callback client component**

Create `/Users/vinei/Projects/eventgate/frontend/components/auth/auth-callback.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConsumeMagicLink } from "@/lib/auth";

type State = { kind: "consuming" } | { kind: "ok" } | { kind: "error"; message: string };

export function AuthCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const consume = useConsumeMagicLink();
  const [state, setState] = useState<State>({ kind: "consuming" });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get("token");
    const next = params.get("next") || "/";
    if (!token) {
      setState({ kind: "error", message: "Missing token in URL." });
      return;
    }
    consume
      .mutateAsync(token)
      .then(() => {
        setState({ kind: "ok" });
        router.replace(next);
      })
      .catch((err: Error) => setState({ kind: "error", message: err.message }));
  }, [params, router, consume]);

  if (state.kind === "consuming") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signing you in…</CardTitle>
          <CardDescription>One moment.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (state.kind === "ok") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signed in</CardTitle>
          <CardDescription>Redirecting…</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in link invalid</CardTitle>
        <CardDescription>{state.message}</CardDescription>
      </CardHeader>
      <CardContent>
        <a className="text-sm underline" href="/login">
          Request a new link
        </a>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(auth)/auth/callback/page.tsx`:

```tsx
import { Suspense } from "react";

import { AuthCallback } from "@/components/auth/auth-callback";

export default function CallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallback />
    </Suspense>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

- [ ] **Step 4: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/app/\(auth\)/auth/callback/ frontend/components/auth/auth-callback.tsx
git commit -m "feat(frontend): add /auth/callback page consuming magic-link tokens"
```

---

## Task 18: `(app)` layout + org list / switcher

**Files:**
- Create: `frontend/app/(app)/layout.tsx`
- Create: `frontend/app/(app)/page.tsx`
- Create: `frontend/components/orgs/org-list.tsx`

- [ ] **Step 1: App-shell layout**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/layout.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useLogout, useMe } from "@/lib/auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3">
          <Link href="/" className="font-semibold">
            Eventgate
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{me.data?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout.mutateAsync();
                router.replace("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl w-full flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Org list component**

Create `/Users/vinei/Projects/eventgate/frontend/components/orgs/org-list.tsx`:

```tsx
"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrgs } from "@/lib/orgs";

export function OrgList() {
  const { data, isLoading, isError } = useOrgs();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError) return <p className="text-sm text-destructive">Failed to load.</p>;

  const orgs = data?.results ?? [];

  if (orgs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You don&apos;t belong to any organizations yet. Create one to get started.
          </p>
          <Button asChild>
            <Link href="/orgs/new">Create organization</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your organizations</h1>
        <Button asChild variant="outline">
          <Link href="/orgs/new">New organization</Link>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {orgs.map((o) => (
          <Card key={o.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <Link href={`/orgs/${o.slug}`} className="hover:underline">
                  {o.name}
                </Link>
                <span className="text-xs font-normal text-muted-foreground">{o.role}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{o.slug}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Org list page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/page.tsx`:

```tsx
import { OrgList } from "@/components/orgs/org-list";

export default function HomePage() {
  return <OrgList />;
}
```

- [ ] **Step 4: Remove the old root `app/page.tsx` (it now lives in `(app)/page.tsx`)**

The Plan A `app/page.tsx` (root, with HealthcheckCard) collides with the `(app)/page.tsx` we just made. Replace it with a server-side redirect.

Replace `/Users/vinei/Projects/eventgate/frontend/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function RootRedirect() {
  redirect("/");
}
```

Wait — that's a recursion. Instead, the cleanest solution: just **delete** `app/page.tsx`. With the `(app)` route group, `/` is served by `app/(app)/page.tsx`. Remove the root file:

```bash
rm /Users/vinei/Projects/eventgate/frontend/app/page.tsx
```

- [ ] **Step 5: Build**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

Expected: build succeeds. The healthcheck route is gone — it'll be revived later as `/debug/health` if needed.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/app/\(app\)/ frontend/components/orgs/org-list.tsx
git rm frontend/app/page.tsx
git commit -m "feat(frontend): add authenticated app shell + org list landing page"
```

---

## Task 19: Create-org form

**Files:**
- Create: `frontend/app/(app)/orgs/new/page.tsx`
- Create: `frontend/components/orgs/create-org-form.tsx`

- [ ] **Step 1: Form component**

Create `/Users/vinei/Projects/eventgate/frontend/components/orgs/create-org-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateOrg } from "@/lib/orgs";

export function CreateOrgForm() {
  const [name, setName] = useState("");
  const create = useCreateOrg();
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const org = await create.mutateAsync(name);
    router.push(`/orgs/${org.slug}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create organization</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            required
            minLength={2}
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Conference 2026"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" disabled={create.isPending || !name} className="w-full">
            {create.isPending ? "Creating…" : "Create"}
          </Button>
          {create.isError && (
            <p className="text-sm text-destructive">{(create.error as Error).message}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/orgs/new/page.tsx`:

```tsx
import { CreateOrgForm } from "@/components/orgs/create-org-form";

export default function NewOrgPage() {
  return (
    <div className="max-w-md mx-auto">
      <CreateOrgForm />
    </div>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
cd /Users/vinei/Projects/eventgate
git add frontend/app/\(app\)/orgs/new/ frontend/components/orgs/create-org-form.tsx
git commit -m "feat(frontend): add /orgs/new create-organization form"
```

---

## Task 20: Org dashboard placeholder + members page

**Files:**
- Create: `frontend/app/(app)/orgs/[slug]/page.tsx`
- Create: `frontend/app/(app)/orgs/[slug]/members/page.tsx`
- Create: `frontend/components/orgs/members-table.tsx`

- [ ] **Step 1: Org dashboard placeholder**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/orgs/[slug]/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrg } from "@/lib/orgs";

export default function OrgDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: org, isLoading, isError } = useOrg(slug);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !org) return <p className="text-sm text-destructive">Organization not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <p className="text-sm text-muted-foreground">{org.slug} · {org.role}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/orgs/${slug}/members`}>Members</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No events yet. Event management lands in Plan C.</p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Members table component**

Create `/Users/vinei/Projects/eventgate/frontend/components/orgs/members-table.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMembers, useSendInvite } from "@/lib/orgs";

type Role = "owner" | "admin" | "manager" | "staff";

export function MembersTable({ slug }: { slug: string }) {
  const members = useMembers(slug);
  const invite = useSendInvite(slug);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [success, setSuccess] = useState<string | null>(null);

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    await invite.mutateAsync({ email, role });
    setSuccess(`Invite sent to ${email}.`);
    setEmail("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite member</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onInvite} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
            <Button type="submit" disabled={invite.isPending || !email}>
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
          {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
          {invite.isError && (
            <p className="mt-3 text-sm text-destructive">{(invite.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {members.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {members.data && (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-normal py-2">Email</th>
                  <th className="text-left font-normal py-2">Role</th>
                  <th className="text-left font-normal py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.data.results.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="py-2">{m.user_email}</td>
                    <td className="py-2">{m.role}</td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(m.accepted_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Members page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(app)/orgs/[slug]/members/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";

import { MembersTable } from "@/components/orgs/members-table";

export default function MembersPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Members</h1>
      <MembersTable slug={slug} />
    </div>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
cd /Users/vinei/Projects/eventgate
git add frontend/app/\(app\)/orgs/\[slug\]/ frontend/components/orgs/members-table.tsx
git commit -m "feat(frontend): add org dashboard placeholder + members + invite form"
```

---

## Task 21: Accept-invite page

**Files:**
- Create: `frontend/app/(auth)/invites/[token]/page.tsx`

- [ ] **Step 1: Page**

Create `/Users/vinei/Projects/eventgate/frontend/app/(auth)/invites/[token]/page.tsx`:

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/lib/auth";
import { useAcceptInvite } from "@/lib/orgs";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const me = useMe();
  const accept = useAcceptInvite();
  const router = useRouter();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    if (me.isLoading) return;
    if (!me.data) {
      // Not signed in — redirect to login with invite in next
      router.replace(`/login?next=/invites/${token}`);
      return;
    }
    ran.current = true;
    accept
      .mutateAsync(token)
      .then(({ organization }) => router.replace(`/orgs/${organization.slug}`))
      .catch((err: Error) => setError(err.message));
  }, [me.data, me.isLoading, token, accept, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accepting invite</CardTitle>
        <CardDescription>{error ?? "One moment…"}</CardDescription>
      </CardHeader>
      {error && (
        <CardContent>
          <a href="/" className="text-sm underline">
            Back home
          </a>
        </CardContent>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
cd /Users/vinei/Projects/eventgate
git add frontend/app/\(auth\)/invites/
git commit -m "feat(frontend): add /invites/[token] accept page"
```

---

## Task 22: Update Plan-A `app/page.tsx` healthcheck-card test (housekeeping)

**Files:**
- Modify or delete: `frontend/components/__tests__/healthcheck-card.test.tsx` (Plan A test)
- Modify: `frontend/tests/healthcheck.spec.ts` (Plan A Playwright)

**Context:** Plan A's home page used a HealthcheckCard. Plan B removes the root home page (the `(app)` route group now owns `/`). The Plan A tests will fail unless we update them.

- [ ] **Step 1: Decide the healthcheck UI's fate**

The HealthcheckCard component itself is fine to keep — it's just no longer auto-rendered. Add a debug page at `/debug/health` that uses it.

Create `/Users/vinei/Projects/eventgate/frontend/app/debug/health/page.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";

import { HealthcheckCard } from "@/components/healthcheck-card";
import { getHealth } from "@/lib/api";

export default function DebugHealthPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["health"], queryFn: getHealth });
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {isLoading && <HealthcheckCard loading />}
        {isError && <HealthcheckCard status="ok" database="error" version="unknown" />}
        {data && (
          <HealthcheckCard status={data.status} database={data.database} version={data.version} />
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Update the Playwright E2E to point at the new URL**

Edit `/Users/vinei/Projects/eventgate/frontend/tests/healthcheck.spec.ts` — change the navigation target:

Replace `await page.goto("/");` with `await page.goto("/debug/health");`.

- [ ] **Step 3: Add `/debug/health` to the middleware public allowlist**

Edit `/Users/vinei/Projects/eventgate/frontend/middleware.ts`:

Replace `const PUBLIC_PATHS = ["/login", "/auth/callback"];` with:

```ts
const PUBLIC_PATHS = ["/login", "/auth/callback", "/debug/health"];
```

- [ ] **Step 4: Run tests + build**

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm test
pnpm build
```

Expected: vitest unit tests for HealthcheckCard still pass (component is unchanged); build passes.

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/app/debug/health/ frontend/tests/healthcheck.spec.ts frontend/middleware.ts
git commit -m "chore(frontend): move HealthcheckCard to /debug/health; allow public access"
```

---

## Task 23: Migrate staging + redeploy backend

**Files:** (no new files; deployment ops)

- [ ] **Step 1: Push to GitHub (triggers backend CI)**

```bash
cd /Users/vinei/Projects/eventgate
git push
```

Wait for backend CI to pass:

```bash
gh run watch --repo vineidev/eventgate
```

Expected: both `backend` and `frontend` workflows complete green.

- [ ] **Step 2: Deploy backend to Fly**

```bash
cd /Users/vinei/Projects/eventgate/backend
flyctl deploy --remote-only --app eventgate-backend-staging
```

Expected: build + push + roll-out succeed.

- [ ] **Step 3: Run migrations on Neon**

```bash
flyctl ssh console -C "python manage.py migrate" --app eventgate-backend-staging
```

Expected: new migrations (`accounts.0001`, `accounts.0002`, `orgs.0001`, `orgs.0002`, `token_blacklist.0001+`) apply cleanly.

- [ ] **Step 4: Set MAGIC_LINK_FRONTEND_URL to Vercel URL on Fly**

```bash
flyctl secrets set --app eventgate-backend-staging MAGIC_LINK_FRONTEND_URL="https://frontend-five-lovat-94.vercel.app"
```

Wait for the redeploy to settle.

- [ ] **Step 5: Verify the new auth endpoint exists**

```bash
curl -s -X POST https://eventgate-backend-staging.fly.dev/api/v1/auth/magic-link/request/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke-test@example.com"}' -i | head -3
```

Expected: `HTTP/2 204`.

- [ ] **Step 6: Fetch the magic-link email from Fly logs**

```bash
flyctl logs --app eventgate-backend-staging --no-tail 2>&1 | grep -A 2 "Click the link"
```

Expected: a printed magic-link URL pointing at the Vercel domain.

---

## Task 24: Redeploy frontend + manual E2E sign-in

**Files:** (no new files; deployment ops)

- [ ] **Step 1: Set NEXT_PUBLIC_API_BASE_URL on Vercel project (persistent, not just build-env)**

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm dlx vercel@latest env add NEXT_PUBLIC_API_BASE_URL production \
  --token "$VERCEL_TOKEN" --scope vineidev-4891s-projects --yes <<< "https://eventgate-backend-staging.fly.dev"
```

(If interactive prompt blocks, the same value was set via `--build-env` previously; this step makes it persistent for future deploys.)

- [ ] **Step 2: Redeploy frontend**

```bash
pnpm dlx vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN" --scope vineidev-4891s-projects
```

Expected: deploys to the same alias `https://frontend-five-lovat-94.vercel.app`.

- [ ] **Step 3: End-to-end manual sign-in test**

1. Open https://frontend-five-lovat-94.vercel.app in a browser.
2. You should be redirected to `/login`.
3. Enter your email (e.g., `you@yourdomain.com`) and submit.
4. Check Fly logs for the magic link:

   ```bash
   flyctl logs --app eventgate-backend-staging --no-tail 2>&1 | grep -A 2 "Click the link" | tail -10
   ```
5. Paste the link in your browser.
6. You should land on `/`, see "Welcome — You don't belong to any organizations yet."
7. Click **Create organization**, name it (e.g., "Test Org"), submit.
8. Redirected to `/orgs/test-org`. See "Events" placeholder card.
9. Click **Members**. Invite `friend@example.com` as Admin.
10. Check Fly logs for the invite link.
11. Sign out, sign in as `friend@example.com` via magic link.
12. Paste the invite link in browser. Should auto-accept and land on the org dashboard with role=admin.

If any step fails, capture the error and debug via Fly logs + Vercel logs.

- [ ] **Step 4: Tighten ALLOWED_HOSTS (cleanup from Plan A follow-up)**

If the manual E2E worked, tighten ALLOWED_HOSTS:

```bash
flyctl secrets set --app eventgate-backend-staging \
  ALLOWED_HOSTS="eventgate-backend-staging.fly.dev,.internal,.fly.dev"
```

Verify healthcheck still works:

```bash
curl -s https://eventgate-backend-staging.fly.dev/api/health/ | python3 -m json.tool
```

If health check fails (Consul check returns 400), revert to `*`:

```bash
flyctl secrets set --app eventgate-backend-staging ALLOWED_HOSTS="*"
```

(Tracking this as a Plan-C follow-up.)

---

## Task 25: Plan B completion checklist

- [ ] **Step 1: Verify all tests pass**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run ruff check .
uv run ruff format --check .
uv run mypy apps config tests
uv run pytest -v

cd /Users/vinei/Projects/eventgate/frontend
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Expected: all green.

- [ ] **Step 2: Verify staging works end-to-end**

```bash
curl -s https://eventgate-backend-staging.fly.dev/api/health/
curl -s -X POST https://eventgate-backend-staging.fly.dev/api/v1/auth/magic-link/request/ -H 'Content-Type: application/json' -d '{"email":"plan-b-done@example.com"}' -i | head -1
```

Expected: health returns ok; auth endpoint returns 204.

- [ ] **Step 3: Append completion log to the plan file**

Append to the bottom of `/Users/vinei/Projects/eventgate/docs/plans/2026-05-20-plan-b-accounts-orgs-memberships.md`:

```markdown
---

## Completion Log

- **Completed:** <YYYY-MM-DD>
- **Backend:** N new tests added, all passing
- **Frontend:** auth + orgs routes deployed
- **Notes:**
  - <any deviations from this plan>
  - <any follow-ups discovered>
```

Fill in the date and notes. Commit:

```bash
cd /Users/vinei/Projects/eventgate
git add docs/plans/2026-05-20-plan-b-accounts-orgs-memberships.md
git commit -m "docs(plan-b): completion log"
```

- [ ] **Step 4: Push final eventgate state**

```bash
cd /Users/vinei/Projects/eventgate
git push
```

- [ ] **Step 5: Announce Plan B done**

Plan B is complete. Next: **Plan C — Events & Public Registration** (~2 weeks). Will add `apps/events`, `apps/guests`, the registration form builder, QR generation (segno + R2), email QR delivery (Resend wired here), and the first public guest pages.

---

## Verification Summary

**What you should have at the end of Plan B:**

1. ✅ Custom `User` model (email-only, no username, no password by default).
2. ✅ `MagicLinkToken` with SHA-256 hash at rest, 15-minute TTL, single-use.
3. ✅ `Organization` + `OrganizationMembership` + `Invite` models with role enum.
4. ✅ `OrgScopedModel` abstract base, `OrgScopedQuerySet`, `IsOrgMember`, `HasOrgRole` permission classes.
5. ✅ JWT in httpOnly cookies (`CookieJWTAuthentication`); refresh + access cookies set on consume.
6. ✅ Auth endpoints: `POST /api/v1/auth/magic-link/request/`, `POST /api/v1/auth/magic-link/consume/`, `GET /api/v1/auth/me/`, `POST /api/v1/auth/logout/`.
7. ✅ Org endpoints: `GET/POST /api/v1/orgs/`, `GET /api/v1/orgs/<slug>/`, `POST /api/v1/orgs/<slug>/invites/`, `GET /api/v1/orgs/<slug>/members/`, `POST /api/v1/auth/invites/<token>/accept/`.
8. ✅ Frontend route guard (middleware) redirecting unauthenticated traffic to `/login`.
9. ✅ Pages: `/login`, `/auth/callback`, `/`, `/orgs/new`, `/orgs/[slug]`, `/orgs/[slug]/members`, `/invites/[token]`, `/debug/health`.
10. ✅ Email delivery via console backend (magic links print to Fly logs at staging).
11. ✅ Django admin registrations for all new models.
12. ✅ Backend tests: ~45 new tests, all passing. Frontend `pnpm build` and `pnpm test` green.
13. ✅ Staging deployed end-to-end with `MAGIC_LINK_FRONTEND_URL` pointing at Vercel.

**What is intentionally NOT in Plan B:**

- ❌ Real email backend (Resend) — added in Plan C alongside QR delivery.
- ❌ Password-based login — magic-link only at MVP.
- ❌ Org settings UI (only create + list + members + invite).
- ❌ Member role-change UI (delete/demote — Plan F).
- ❌ Per-event roles (`EventStaff`) — Plan D's concern.
- ❌ Org switcher with multiple-org keyboard shortcuts.
- ❌ Email verification flow (signing in IS email verification at MVP).
- ❌ 2FA, SSO, SAML — Phase 3+.
- ❌ Rate limiting on `/auth/magic-link/request/` — Plan F (with real email).

---

## Risks & follow-ups

| Risk | Mitigation |
|---|---|
| Magic-link rate-limiting absent (DDOS or abuse) | Add Redis-backed throttle in Plan C alongside Resend. |
| JWT cookies set with `Lax` cross-origin but Vercel and Fly are different domains — refresh token may not flow on POST from Vercel | Use `SameSite=None; Secure` once production HTTPS is in place. Already deferred to `JWT_COOKIE_SAMESITE` env var. |
| `ALLOWED_HOSTS=*` on staging | Tightened to `.fly.dev,.internal` in Task 24 Step 4. |
| Invite email reveals org name to recipient even if they reject | Acceptable — invites are inherently revealing. |
| No mechanism to delete an organization | Deferred to Plan F (operations & admin). |
| Cross-org session collision (logged-in user opens another org's invite for different email) | Returns 403 by design; tested. |

---

## Decision Heritage (still preserved)

Plan B does not touch any of the firm decisions from Appendix A of the brief — those concern the door flow (Plan C onward). What Plan B locks in additionally:

- **Email is the only identifier.** No usernames. No phone-as-login. Phone is per-event guest data.
- **Magic-link is the only auth method at MVP.** Passwords are explicitly deferred.
- **JWT in httpOnly cookie + Authorization-header fallback.** Cookie for browser, header for curl/tests/server-to-server.
- **404 over the org for non-members.** Do not reveal org existence to outsiders.
- **One open invite per (org, email) at a time.** New invite revokes prior open invite.
- **Owner-on-create.** Creating an org auto-makes the creator the owner — no separate ownership-claim step.
