# Plan A — Foundation & Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a fresh monorepo containing a Django 5 + DRF backend and a Next.js 14 + shadcn/ui frontend, deployed to a staging environment in Singapore region, with CI/CD, observability, and a working end-to-end healthcheck. This is **Plan A of an 8-plan Phase 1 sequence** (see brief §12); subsequent plans add accounts, events, scanner PWA, offline sync, help-desk, integrations, and pilot hardening.

**Architecture:** Two-app monorepo (`backend/` and `frontend/`). Django runs in Docker locally (Postgres + Redis via docker-compose) and on Fly.io in staging (Singapore). Next.js runs on Vercel. Managed Postgres (Neon) and Redis (Upstash) for staging. Sentry for errors. GitHub Actions for CI. No tenant/event/guest code in this plan — that lives in Plan B onward.

**Tech Stack:** Python 3.12, Django 5, Django REST Framework, drf-spectacular, Celery, uv (Python package manager), Postgres 16, Redis 7, Sentry; Node 20, Next.js 14 (App Router), TypeScript, shadcn/ui, Tailwind, next-intl, TanStack Query, pnpm, Vitest, Playwright; GitHub Actions, Fly.io, Vercel, Neon, Upstash.

---

## File Structure

This plan creates the following structure. Subsequent plans extend it; Plan A leaves clean foundations.

```text
eventgate/                                # NEW monorepo (separate from existing Paperless-Pre-check-in)
├── .github/workflows/
│   ├── backend.yml                       # lint + test + build
│   └── frontend.yml                      # lint + test + build
├── .gitignore
├── README.md
├── docker-compose.yml                    # local Postgres + Redis
├── backend/
│   ├── pyproject.toml                    # uv project config + deps
│   ├── uv.lock
│   ├── manage.py
│   ├── Dockerfile
│   ├── fly.toml
│   ├── .env.example
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings/{__init__,base,dev,prod,test}.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   ├── asgi.py
│   │   └── celery.py
│   ├── apps/
│   │   └── common/
│   │       ├── __init__.py
│   │       ├── apps.py
│   │       ├── views.py                  # healthcheck endpoint
│   │       └── urls.py
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   └── test_healthcheck.py
│   └── .ruff.toml
├── frontend/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── components.json                   # shadcn config
│   ├── playwright.config.ts
│   ├── vitest.config.ts
│   ├── .eslintrc.json
│   ├── .prettierrc
│   ├── .env.example
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # healthcheck page
│   │   ├── globals.css
│   │   └── providers.tsx                 # TanStack Query
│   ├── components/
│   │   └── ui/                           # shadcn primitives (button, card initially)
│   ├── lib/
│   │   ├── api.ts                        # fetch wrapper
│   │   └── i18n/
│   │       ├── config.ts
│   │       └── messages/en.json
│   ├── public/
│   ├── tests/
│   │   └── healthcheck.spec.ts           # Playwright E2E
│   └── components/__tests__/
│       └── healthcheck-card.test.tsx     # Vitest unit
└── docs/
    ├── README.md
    └── runbooks/                         # filled in later plans
```

**Boundary notes:**
- `apps/common/` is where genuinely cross-cutting code goes (healthcheck, OrgScopedModel base in Plan B, permissions). Keep it small — if it's not used by ≥2 other apps, it belongs in the app that uses it.
- `config/settings/` uses split settings (base + per-env overrides). Do **not** dump everything in one `settings.py`.
- Frontend uses Next.js App Router. Server components by default; client components only where needed (`"use client"`).

---

## Task 1: Initialize the monorepo

**Files:**
- Create: `/Users/vinei/Projects/eventgate/.gitignore`
- Create: `/Users/vinei/Projects/eventgate/README.md`

- [ ] **Step 1: Create the directory and init git**

Run:

```bash
mkdir -p /Users/vinei/Projects/eventgate
cd /Users/vinei/Projects/eventgate
git init -b main
```

Expected: `Initialized empty Git repository in /Users/vinei/Projects/eventgate/.git/`

- [ ] **Step 2: Write the .gitignore**

Create `/Users/vinei/Projects/eventgate/.gitignore`:

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/
.python-version

# Virtualenvs / package managers
.venv/
venv/
.uv-cache/

# Node
node_modules/
.next/
out/
.turbo/
*.tsbuildinfo

# Env
.env
.env.local
.env.*.local
!.env.example

# IDE
.idea/
.vscode/
*.swp
.DS_Store

# Docker
docker-volumes/

# Build artifacts
dist/
build/
*.log
```

- [ ] **Step 3: Write the top-level README**

Create `/Users/vinei/Projects/eventgate/README.md`:

```markdown
# Eventgate

SaaS for fast, paperless event entrance — Southeast Asia first.

Monorepo:
- `backend/` — Django 5 + DRF API
- `frontend/` — Next.js 14 dashboard + PWA scanner

## Quick start (local dev)

```bash
docker compose up -d              # Postgres + Redis
cd backend && uv sync && uv run manage.py migrate && uv run manage.py runserver
cd frontend && pnpm install && pnpm dev
```

Visit http://localhost:3000 — you should see "Backend: ok" on the home page.

## Repos & deploy

- Backend: Fly.io (Singapore region)
- Frontend: Vercel
- Postgres: Neon (Singapore)
- Redis: Upstash (Singapore)
- Errors: Sentry

## Docs

- `docs/brief.md` — SaaS direction brief (the strategic foundation for all plans)
- `docs/plans/` — sprint-by-sprint implementation plans (Plan A, B, …)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add .gitignore README.md
git commit -m "chore: initialize monorepo with .gitignore and README"
```

Expected: one commit on `main`.

---

## Task 2: Backend Python project init (uv)

**Files:**
- Create: `/Users/vinei/Projects/eventgate/backend/pyproject.toml`
- Create: `/Users/vinei/Projects/eventgate/backend/.python-version`

- [ ] **Step 1: Install uv if missing**

Run:

```bash
which uv || curl -LsSf https://astral.sh/uv/install.sh | sh
uv --version
```

Expected: `uv 0.4.x` (any 0.4+ is fine).

- [ ] **Step 2: Create backend directory and pyproject.toml**

```bash
mkdir -p /Users/vinei/Projects/eventgate/backend
cd /Users/vinei/Projects/eventgate/backend
```

Create `/Users/vinei/Projects/eventgate/backend/pyproject.toml`:

```toml
[project]
name = "eventgate-backend"
version = "0.1.0"
description = "Eventgate SaaS backend (Django + DRF)"
requires-python = ">=3.12,<3.13"
dependencies = [
  "django>=5.0,<5.2",
  "djangorestframework>=3.15,<3.16",
  "drf-spectacular>=0.27,<0.28",
  "django-environ>=0.11,<0.12",
  "psycopg[binary]>=3.2,<3.3",
  "redis>=5.0,<6.0",
  "celery>=5.4,<5.5",
  "sentry-sdk>=2.10,<3.0",
  "gunicorn>=22.0,<23.0",
  "uvicorn[standard]>=0.30,<0.31",
  "whitenoise>=6.7,<7.0",
]

[dependency-groups]
dev = [
  "pytest>=8.0,<9.0",
  "pytest-django>=4.8,<5.0",
  "pytest-cov>=5.0,<6.0",
  "ruff>=0.6,<0.7",
  "mypy>=1.11,<2.0",
  "django-stubs[compatible-mypy]>=5.0,<6.0",
  "pre-commit>=3.8,<4.0",
]

[tool.uv]
package = false

[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings.test"
python_files = ["test_*.py", "*_test.py"]
addopts = "-ra --strict-markers --strict-config"

[tool.ruff]
line-length = 100
target-version = "py312"
extend-exclude = ["migrations"]

[tool.ruff.lint]
select = ["E", "F", "I", "B", "C4", "DJ", "UP", "RUF"]
ignore = ["E501"]

[tool.mypy]
python_version = "3.12"
strict = false
plugins = ["mypy_django_plugin.main"]

[tool.django-stubs]
django_settings_module = "config.settings.dev"
```

- [ ] **Step 3: Pin Python version**

Create `/Users/vinei/Projects/eventgate/backend/.python-version`:

```text
3.12
```

- [ ] **Step 4: Sync dependencies**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv sync
```

Expected: `.venv` created, all dependencies resolved, `uv.lock` written.

- [ ] **Step 5: Verify Django is installed**

```bash
uv run python -c "import django; print(django.get_version())"
```

Expected: `5.x.x` (some 5.0+ patch version).

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/pyproject.toml backend/uv.lock backend/.python-version
git commit -m "feat(backend): initialize uv project with Django + DRF dependencies"
```

---

## Task 3: Django project scaffold with split settings

**Files:**
- Create: `/Users/vinei/Projects/eventgate/backend/manage.py`
- Create: `/Users/vinei/Projects/eventgate/backend/config/__init__.py`
- Create: `/Users/vinei/Projects/eventgate/backend/config/settings/__init__.py`
- Create: `/Users/vinei/Projects/eventgate/backend/config/settings/base.py`
- Create: `/Users/vinei/Projects/eventgate/backend/config/settings/dev.py`
- Create: `/Users/vinei/Projects/eventgate/backend/config/settings/prod.py`
- Create: `/Users/vinei/Projects/eventgate/backend/config/settings/test.py`
- Create: `/Users/vinei/Projects/eventgate/backend/config/urls.py`
- Create: `/Users/vinei/Projects/eventgate/backend/config/wsgi.py`
- Create: `/Users/vinei/Projects/eventgate/backend/config/asgi.py`
- Create: `/Users/vinei/Projects/eventgate/backend/.env.example`

- [ ] **Step 1: Create manage.py**

Create `/Users/vinei/Projects/eventgate/backend/manage.py`:

```python
#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you in the uv venv? Run `uv sync`."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Create the config package**

```bash
cd /Users/vinei/Projects/eventgate/backend
mkdir -p config/settings
touch config/__init__.py config/settings/__init__.py
```

- [ ] **Step 3: Write base settings**

Create `/Users/vinei/Projects/eventgate/backend/config/settings/base.py`:

```python
"""Base settings — shared across dev, prod, test."""
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    SECRET_KEY=(str, "insecure-default-replace-me"),
    ALLOWED_HOSTS=(list, ["*"]),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "apps.common",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": env.db_url(
        "DATABASE_URL",
        default="postgres://eventgate:eventgate@localhost:5432/eventgate",
    ),
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/0"),
    }
}

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_PARSER_CLASSES": ("rest_framework.parsers.JSONParser",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Eventgate API",
    "DESCRIPTION": "SaaS for fast paperless event entrance",
    "VERSION": "0.1.0",
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Singapore"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/2")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
```

- [ ] **Step 4: Write dev settings**

Create `/Users/vinei/Projects/eventgate/backend/config/settings/dev.py`:

```python
"""Local development settings."""
from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]
SECRET_KEY = "dev-insecure-secret-change-me"

# Easier debugging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
```

- [ ] **Step 5: Write prod settings**

Create `/Users/vinei/Projects/eventgate/backend/config/settings/prod.py`:

```python
"""Production settings — staging + production."""
import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.django import DjangoIntegration

from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["*.fly.dev"])

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration(), CeleryIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
        environment=env("SENTRY_ENVIRONMENT", default="staging"),
    )
```

- [ ] **Step 6: Write test settings**

Create `/Users/vinei/Projects/eventgate/backend/config/settings/test.py`:

```python
"""Test settings — fast, isolated."""
from .base import *  # noqa: F401,F403

DEBUG = False
SECRET_KEY = "test-insecure-secret"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "eventgate_test",
        "USER": "eventgate",
        "PASSWORD": "eventgate",
        "HOST": "localhost",
        "PORT": "5432",
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Eager Celery for tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
```

- [ ] **Step 7: Write urls.py, wsgi.py, asgi.py**

Create `/Users/vinei/Projects/eventgate/backend/config/urls.py`:

```python
"""Root URL configuration."""
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/", include("apps.common.urls")),
]
```

Create `/Users/vinei/Projects/eventgate/backend/config/wsgi.py`:

```python
"""WSGI config."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
application = get_wsgi_application()
```

Create `/Users/vinei/Projects/eventgate/backend/config/asgi.py`:

```python
"""ASGI config."""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
application = get_asgi_application()
```

- [ ] **Step 8: Write .env.example**

Create `/Users/vinei/Projects/eventgate/backend/.env.example`:

```ini
# Copy to .env for local dev
DEBUG=True
SECRET_KEY=dev-insecure-secret-change-me
ALLOWED_HOSTS=*
DATABASE_URL=postgres://eventgate:eventgate@localhost:5432/eventgate
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
```

- [ ] **Step 9: Verify Django can boot (no DB yet)**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python -c "import django; django.setup()" --settings=config.settings.dev || true
DJANGO_SETTINGS_MODULE=config.settings.dev uv run python -c "
import django
django.setup()
from django.conf import settings
print('Django boots:', settings.SETTINGS_MODULE)
"
```

Expected: `Django boots: config.settings.dev`

- [ ] **Step 10: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/manage.py backend/config backend/.env.example
git commit -m "feat(backend): scaffold Django project with split settings"
```

---

## Task 4: Local docker-compose for Postgres + Redis

**Files:**
- Create: `/Users/vinei/Projects/eventgate/docker-compose.yml`

- [ ] **Step 1: Write docker-compose.yml**

Create `/Users/vinei/Projects/eventgate/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: eventgate
      POSTGRES_PASSWORD: eventgate
      POSTGRES_DB: eventgate
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U eventgate"]
      interval: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      retries: 10

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 2: Boot the services**

```bash
cd /Users/vinei/Projects/eventgate
docker compose up -d
docker compose ps
```

Expected: both `postgres` and `redis` show `running` and `healthy`.

- [ ] **Step 3: Create local .env**

```bash
cd /Users/vinei/Projects/eventgate/backend
cp .env.example .env
```

- [ ] **Step 4: Create the test database**

```bash
docker compose exec postgres psql -U eventgate -c "CREATE DATABASE eventgate_test;" || true
```

Expected: `CREATE DATABASE` (or `already exists` — both fine).

- [ ] **Step 5: Run initial migrations**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py migrate
```

Expected: a long list of `Applying ...OK` lines ending with all default Django migrations applied.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add docker-compose.yml
git commit -m "chore: add docker-compose for local Postgres and Redis"
```

---

## Task 5: Common app skeleton + healthcheck endpoint (TDD)

**Files:**
- Create: `/Users/vinei/Projects/eventgate/backend/apps/__init__.py`
- Create: `/Users/vinei/Projects/eventgate/backend/apps/common/__init__.py`
- Create: `/Users/vinei/Projects/eventgate/backend/apps/common/apps.py`
- Create: `/Users/vinei/Projects/eventgate/backend/apps/common/urls.py`
- Create: `/Users/vinei/Projects/eventgate/backend/apps/common/views.py`
- Create: `/Users/vinei/Projects/eventgate/backend/tests/__init__.py`
- Create: `/Users/vinei/Projects/eventgate/backend/tests/conftest.py`
- Create: `/Users/vinei/Projects/eventgate/backend/tests/test_healthcheck.py`

- [ ] **Step 1: Create the apps and tests packages**

```bash
cd /Users/vinei/Projects/eventgate/backend
mkdir -p apps/common tests
touch apps/__init__.py apps/common/__init__.py tests/__init__.py
```

- [ ] **Step 2: Write apps/common/apps.py**

Create `/Users/vinei/Projects/eventgate/backend/apps/common/apps.py`:

```python
from django.apps import AppConfig


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"
    label = "common"
```

- [ ] **Step 3: Write the failing test**

Create `/Users/vinei/Projects/eventgate/backend/tests/conftest.py`:

```python
import pytest
from rest_framework.test import APIClient


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()
```

Create `/Users/vinei/Projects/eventgate/backend/tests/test_healthcheck.py`:

```python
import pytest


@pytest.mark.django_db
def test_healthcheck_returns_ok(api_client) -> None:
    response = api_client.get("/api/health/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert body["database"] == "ok"
```

- [ ] **Step 4: Run the test, see it fail**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_healthcheck.py -v
```

Expected: FAIL with `404` or `ModuleNotFoundError: apps.common.urls`.

- [ ] **Step 5: Implement the view and URL**

Create `/Users/vinei/Projects/eventgate/backend/apps/common/views.py`:

```python
from __future__ import annotations

from django.db import connection
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthcheckView(APIView):
    """Liveness + database-reachability probe.

    Returns 200 with database status, never raises on DB error — instead reports
    `database: "error"` so the endpoint stays available for load balancers.
    """

    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request: Request) -> Response:
        try:
            with connection.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            db_status = "ok"
        except Exception:
            db_status = "error"
        return Response({"status": "ok", "version": "0.1.0", "database": db_status})
```

Create `/Users/vinei/Projects/eventgate/backend/apps/common/urls.py`:

```python
from django.urls import path

from apps.common.views import HealthcheckView

urlpatterns = [
    path("health/", HealthcheckView.as_view(), name="healthcheck"),
]
```

- [ ] **Step 6: Run the test again, see it pass**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_healthcheck.py -v
```

Expected: `1 passed`.

- [ ] **Step 7: Sanity-check the endpoint manually**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py runserver 8000 &
sleep 2
curl -s http://localhost:8000/api/health/ | python -m json.tool
kill %1 2>/dev/null
```

Expected:

```json
{
    "status": "ok",
    "version": "0.1.0",
    "database": "ok"
}
```

- [ ] **Step 8: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/apps backend/tests
git commit -m "feat(backend): add common app with healthcheck endpoint (TDD)"
```

---

## Task 6: Linting and formatting (ruff)

**Files:**
- Create: `/Users/vinei/Projects/eventgate/backend/.ruff.toml` (config already in pyproject.toml, this file is intentionally not separate — skip if pyproject works)

- [ ] **Step 1: Run ruff check on the codebase**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run ruff check .
```

Expected: `All checks passed!`

- [ ] **Step 2: Run ruff format check**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run ruff format --check .
```

Expected: `N files already formatted.` If any aren't, run `uv run ruff format .` and re-check.

- [ ] **Step 3: Run mypy**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run mypy apps config tests
```

Expected: `Success: no issues found in N source files.` If errors, fix or add `# type: ignore[reason]` only when justified.

- [ ] **Step 4: Commit any formatting fixes**

```bash
cd /Users/vinei/Projects/eventgate
git status
```

If there are changes from `ruff format`:

```bash
git add -A
git commit -m "style(backend): apply ruff formatting"
```

Otherwise skip this step.

---

## Task 7: Sentry integration (smoke test)

**Files:**
- Modify: `/Users/vinei/Projects/eventgate/backend/config/settings/prod.py` (already wired in Task 3)

- [ ] **Step 1: Verify Sentry is conditional on DSN**

Read `/Users/vinei/Projects/eventgate/backend/config/settings/prod.py` lines around the `sentry_sdk.init` call. Confirm:
- It only initializes if `SENTRY_DSN` is set (already done).
- `send_default_pii=False` (already done — required for guest privacy).

No code changes needed; this task is verification only.

- [ ] **Step 2: Add a test that prod settings don't crash without DSN**

Append to `/Users/vinei/Projects/eventgate/backend/tests/test_healthcheck.py`:

```python
def test_prod_settings_import_without_sentry_dsn(monkeypatch) -> None:
    """Importing prod settings with no SENTRY_DSN must not crash."""
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.prod")
    monkeypatch.setenv("SECRET_KEY", "test")
    monkeypatch.setenv("ALLOWED_HOSTS", "test.example.com")
    monkeypatch.setenv("DATABASE_URL", "postgres://eventgate:eventgate@localhost:5432/eventgate")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")

    import importlib
    import config.settings.prod  # noqa: F401
    importlib.reload(config.settings.prod)
```

- [ ] **Step 3: Run the test**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_healthcheck.py::test_prod_settings_import_without_sentry_dsn -v
```

Expected: `1 passed`.

- [ ] **Step 4: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/tests
git commit -m "test(backend): verify prod settings boot without Sentry DSN"
```

---

## Task 8: Celery skeleton + smoke task

**Files:**
- Create: `/Users/vinei/Projects/eventgate/backend/config/celery.py`
- Modify: `/Users/vinei/Projects/eventgate/backend/config/__init__.py`
- Create: `/Users/vinei/Projects/eventgate/backend/apps/common/tasks.py`

- [ ] **Step 1: Write the Celery app**

Create `/Users/vinei/Projects/eventgate/backend/config/celery.py`:

```python
"""Celery app entrypoint."""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("eventgate")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
```

- [ ] **Step 2: Wire it into the package init**

Replace `/Users/vinei/Projects/eventgate/backend/config/__init__.py` content with:

```python
from .celery import app as celery_app

__all__ = ("celery_app",)
```

- [ ] **Step 3: Write a smoke task**

Create `/Users/vinei/Projects/eventgate/backend/apps/common/tasks.py`:

```python
from celery import shared_task


@shared_task
def ping() -> str:
    """Smoke task. Returns 'pong'."""
    return "pong"
```

- [ ] **Step 4: Write a test for the task (eager mode)**

Append to `/Users/vinei/Projects/eventgate/backend/tests/test_healthcheck.py`:

```python
def test_celery_ping_task() -> None:
    from apps.common.tasks import ping
    result = ping.delay()
    assert result.get(timeout=2) == "pong"
```

- [ ] **Step 5: Run the test**

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run pytest tests/test_healthcheck.py::test_celery_ping_task -v
```

Expected: `1 passed` (eager mode — runs synchronously).

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/config backend/apps/common/tasks.py backend/tests
git commit -m "feat(backend): add Celery app skeleton with smoke task"
```

---

## Task 9: Pre-commit hooks

**Files:**
- Create: `/Users/vinei/Projects/eventgate/.pre-commit-config.yaml`

- [ ] **Step 1: Write the pre-commit config**

Create `/Users/vinei/Projects/eventgate/.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
        args: ["--maxkb=500"]
      - id: check-merge-conflict
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.9
    hooks:
      - id: ruff
        args: [--fix]
        files: ^backend/
      - id: ruff-format
        files: ^backend/
  - repo: local
    hooks:
      - id: frontend-lint
        name: frontend eslint
        entry: bash -c 'cd frontend && pnpm lint'
        language: system
        files: ^frontend/.*\.(ts|tsx|js|jsx)$
        pass_filenames: false
```

- [ ] **Step 2: Install pre-commit hooks**

```bash
cd /Users/vinei/Projects/eventgate
uv tool install pre-commit || pip install --user pre-commit
pre-commit install
```

Expected: `pre-commit installed at .git/hooks/pre-commit`.

- [ ] **Step 3: Run pre-commit on all files (sanity)**

```bash
cd /Users/vinei/Projects/eventgate
pre-commit run --all-files || true
```

Expected: passes (frontend hook will skip until Task 10 creates the frontend; that's fine).

- [ ] **Step 4: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add .pre-commit-config.yaml
git commit -m "chore: add pre-commit hooks for lint + format"
```

---

## Task 10: Frontend Next.js project init

**Files:**
- Create: `/Users/vinei/Projects/eventgate/frontend/package.json`
- Create: `/Users/vinei/Projects/eventgate/frontend/tsconfig.json`
- Create: `/Users/vinei/Projects/eventgate/frontend/next.config.mjs`
- Create: `/Users/vinei/Projects/eventgate/frontend/app/layout.tsx`
- Create: `/Users/vinei/Projects/eventgate/frontend/app/page.tsx`
- Create: `/Users/vinei/Projects/eventgate/frontend/app/globals.css`

- [ ] **Step 1: Verify Node + pnpm are installed**

Run:

```bash
node --version
pnpm --version || npm install -g pnpm
```

Expected: Node ≥20, pnpm ≥9.

- [ ] **Step 2: Scaffold Next.js**

```bash
cd /Users/vinei/Projects/eventgate
pnpm create next-app@latest frontend --typescript --tailwind --app --no-src-dir --no-eslint --import-alias "@/*"
```

When prompted "Use Turbopack?", say **No** (avoid flux during MVP).

Expected: `frontend/` directory created with Next.js 14 boilerplate.

- [ ] **Step 3: Sanity-check the dev server**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm dev &
sleep 5
curl -s http://localhost:3000 | head -1
kill %1 2>/dev/null
```

Expected: HTTP 200 returning HTML containing `<!DOCTYPE html>`.

- [ ] **Step 4: Replace boilerplate page**

Replace `/Users/vinei/Projects/eventgate/frontend/app/page.tsx` with:

```tsx
export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Eventgate</h1>
        <p className="text-muted-foreground mt-2">Foundation up. Replace me in Plan B.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): scaffold Next.js 14 with TypeScript and Tailwind"
```

---

## Task 11: shadcn/ui setup

**Files:**
- Create: `/Users/vinei/Projects/eventgate/frontend/components.json`
- Create: `/Users/vinei/Projects/eventgate/frontend/components/ui/button.tsx`
- Create: `/Users/vinei/Projects/eventgate/frontend/components/ui/card.tsx`
- Modify: `/Users/vinei/Projects/eventgate/frontend/app/globals.css`

- [ ] **Step 1: Initialize shadcn**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm dlx shadcn@latest init
```

When prompted:
- Style: `Default`
- Base color: `Slate`
- CSS variables: `Yes`

Expected: `components.json` created, `tailwind.config.ts` updated, `app/globals.css` updated with CSS variables.

- [ ] **Step 2: Add `button` and `card` primitives**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm dlx shadcn@latest add button card
```

Expected: `components/ui/button.tsx` and `components/ui/card.tsx` created.

- [ ] **Step 3: Verify build still passes**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm build
```

Expected: build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): add shadcn/ui with button and card primitives"
```

---

## Task 12: TanStack Query provider and API wrapper

**Files:**
- Create: `/Users/vinei/Projects/eventgate/frontend/app/providers.tsx`
- Modify: `/Users/vinei/Projects/eventgate/frontend/app/layout.tsx`
- Create: `/Users/vinei/Projects/eventgate/frontend/lib/api.ts`
- Create: `/Users/vinei/Projects/eventgate/frontend/.env.example`
- Create: `/Users/vinei/Projects/eventgate/frontend/.env.local`

- [ ] **Step 1: Install TanStack Query**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm add @tanstack/react-query @tanstack/react-query-devtools
```

- [ ] **Step 2: Write providers.tsx**

Create `/Users/vinei/Projects/eventgate/frontend/app/providers.tsx`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Wire providers into layout**

Replace `/Users/vinei/Projects/eventgate/frontend/app/layout.tsx`:

```tsx
import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Eventgate",
  description: "Fast paperless event entrance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Write the API wrapper**

Create `/Users/vinei/Projects/eventgate/frontend/lib/api.ts`:

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type HealthResponse = {
  status: "ok";
  version: string;
  database: "ok" | "error";
};

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health/`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json() as Promise<HealthResponse>;
}
```

- [ ] **Step 5: Write env templates**

Create `/Users/vinei/Projects/eventgate/frontend/.env.example`:

```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Create `/Users/vinei/Projects/eventgate/frontend/.env.local`:

```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): add TanStack Query provider and API wrapper"
```

---

## Task 13: Healthcheck card component (TDD with Vitest)

**Files:**
- Create: `/Users/vinei/Projects/eventgate/frontend/vitest.config.ts`
- Create: `/Users/vinei/Projects/eventgate/frontend/vitest.setup.ts`
- Create: `/Users/vinei/Projects/eventgate/frontend/components/healthcheck-card.tsx`
- Create: `/Users/vinei/Projects/eventgate/frontend/components/__tests__/healthcheck-card.test.tsx`
- Modify: `/Users/vinei/Projects/eventgate/frontend/app/page.tsx`

- [ ] **Step 1: Install Vitest + testing library**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @types/node
```

- [ ] **Step 2: Write vitest.config.ts**

Create `/Users/vinei/Projects/eventgate/frontend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 3: Write vitest.setup.ts**

Create `/Users/vinei/Projects/eventgate/frontend/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test script**

In `/Users/vinei/Projects/eventgate/frontend/package.json`, add to `"scripts"`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

(Keep the existing dev/build/start scripts; only add these two.)

- [ ] **Step 5: Write the failing component test**

Create `/Users/vinei/Projects/eventgate/frontend/components/__tests__/healthcheck-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HealthcheckCard } from "@/components/healthcheck-card";

describe("HealthcheckCard", () => {
  it("renders ok state", () => {
    render(<HealthcheckCard status="ok" database="ok" version="0.1.0" />);
    expect(screen.getByText(/Backend: ok/i)).toBeInTheDocument();
    expect(screen.getByText(/Database: ok/i)).toBeInTheDocument();
    expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument();
  });

  it("renders database error", () => {
    render(<HealthcheckCard status="ok" database="error" version="0.1.0" />);
    expect(screen.getByText(/Database: error/i)).toBeInTheDocument();
  });

  it("renders loading state", () => {
    render(<HealthcheckCard loading />);
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test, see it fail**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm test
```

Expected: 3 failures with `Cannot find module '@/components/healthcheck-card'`.

- [ ] **Step 7: Implement the component**

Create `/Users/vinei/Projects/eventgate/frontend/components/healthcheck-card.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props =
  | { loading: true; status?: never; database?: never; version?: never }
  | { loading?: false; status: "ok"; database: "ok" | "error"; version: string };

export function HealthcheckCard(props: Props) {
  if (props.loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Healthcheck</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Checking...</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Healthcheck</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p>Backend: {props.status}</p>
        <p>Database: {props.database}</p>
        <p className="text-muted-foreground text-sm">v{props.version}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Run the test, see it pass**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm test
```

Expected: `3 passed`.

- [ ] **Step 9: Wire the card into the home page**

Replace `/Users/vinei/Projects/eventgate/frontend/app/page.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { getHealth } from "@/lib/api";
import { HealthcheckCard } from "@/components/healthcheck-card";

export default function HomePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
  });

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-3xl font-semibold text-center">Eventgate</h1>
        {isLoading && <HealthcheckCard loading />}
        {isError && (
          <HealthcheckCard status="ok" database="error" version="unknown" />
        )}
        {data && (
          <HealthcheckCard
            status={data.status}
            database={data.database}
            version={data.version}
          />
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 10: Manual smoke check**

In one terminal:

```bash
cd /Users/vinei/Projects/eventgate/backend
uv run python manage.py runserver 8000
```

In another:

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm dev
```

Open http://localhost:3000 — expect to see "Backend: ok", "Database: ok", "v0.1.0".

- [ ] **Step 11: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "feat(frontend): add healthcheck card with TDD coverage"
```

---

## Task 14: Frontend lint (ESLint + Prettier)

**Files:**
- Create: `/Users/vinei/Projects/eventgate/frontend/.eslintrc.json`
- Create: `/Users/vinei/Projects/eventgate/frontend/.prettierrc`

- [ ] **Step 1: Install ESLint + Prettier**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm add -D eslint eslint-config-next prettier eslint-config-prettier
```

- [ ] **Step 2: Write ESLint config**

Create `/Users/vinei/Projects/eventgate/frontend/.eslintrc.json`:

```json
{
  "extends": ["next/core-web-vitals", "next/typescript", "prettier"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

- [ ] **Step 3: Write Prettier config**

Create `/Users/vinei/Projects/eventgate/frontend/.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 4: Add lint scripts**

In `/Users/vinei/Projects/eventgate/frontend/package.json` scripts:

```json
{
  "scripts": {
    "lint": "next lint",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

- [ ] **Step 5: Run lint + format**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm lint
pnpm format
pnpm format:check
```

Expected: lint passes; format writes any drift; format:check passes.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "chore(frontend): add ESLint + Prettier config"
```

---

## Task 15: Playwright E2E (healthcheck happy path)

**Files:**
- Create: `/Users/vinei/Projects/eventgate/frontend/playwright.config.ts`
- Create: `/Users/vinei/Projects/eventgate/frontend/tests/healthcheck.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

- [ ] **Step 2: Write playwright.config.ts**

Create `/Users/vinei/Projects/eventgate/frontend/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 3: Write the healthcheck E2E test**

Create `/Users/vinei/Projects/eventgate/frontend/tests/healthcheck.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("home page renders backend healthcheck", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Eventgate")).toBeVisible();
  await expect(page.getByText(/Backend: ok/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Database: ok/i)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 4: Add test:e2e script**

In `/Users/vinei/Projects/eventgate/frontend/package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 5: Run the E2E test**

Start backend and frontend in separate terminals (see Task 13 Step 10), then:

```bash
cd /Users/vinei/Projects/eventgate/frontend
pnpm test:e2e
```

Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/
git commit -m "test(frontend): add Playwright E2E for healthcheck"
```

---

## Task 16: GitHub Actions CI — backend

**Files:**
- Create: `/Users/vinei/Projects/eventgate/.github/workflows/backend.yml`

- [ ] **Step 1: Write the workflow**

Create `/Users/vinei/Projects/eventgate/.github/workflows/backend.yml`:

```yaml
name: backend

on:
  push:
    branches: [main]
    paths:
      - "backend/**"
      - ".github/workflows/backend.yml"
  pull_request:
    paths:
      - "backend/**"
      - ".github/workflows/backend.yml"

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: eventgate
          POSTGRES_PASSWORD: eventgate
          POSTGRES_DB: eventgate_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 5s --health-retries 5

    defaults:
      run:
        working-directory: backend

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          enable-cache: true

      - name: Set up Python
        run: uv python install 3.12

      - name: Install deps
        run: uv sync --frozen

      - name: Ruff check
        run: uv run ruff check .

      - name: Ruff format check
        run: uv run ruff format --check .

      - name: Mypy
        run: uv run mypy apps config tests

      - name: Pytest
        run: uv run pytest -v
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add .github/workflows/backend.yml
git commit -m "ci: add backend GitHub Actions workflow"
```

- [ ] **Step 3: Push and verify**

(Once a remote is added — Task 19.) For now skip the verify step; it'll run on the first push.

---

## Task 17: GitHub Actions CI — frontend

**Files:**
- Create: `/Users/vinei/Projects/eventgate/.github/workflows/frontend.yml`

- [ ] **Step 1: Write the workflow**

Create `/Users/vinei/Projects/eventgate/.github/workflows/frontend.yml`:

```yaml
name: frontend

on:
  push:
    branches: [main]
    paths:
      - "frontend/**"
      - ".github/workflows/frontend.yml"
  pull_request:
    paths:
      - "frontend/**"
      - ".github/workflows/frontend.yml"

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Unit tests
        run: pnpm test

      - name: Build
        run: pnpm build
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add .github/workflows/frontend.yml
git commit -m "ci: add frontend GitHub Actions workflow"
```

---

## Task 18: Backend Dockerfile + Fly.io config

**Files:**
- Create: `/Users/vinei/Projects/eventgate/backend/Dockerfile`
- Create: `/Users/vinei/Projects/eventgate/backend/.dockerignore`
- Create: `/Users/vinei/Projects/eventgate/backend/fly.toml`

- [ ] **Step 1: Write the Dockerfile**

Create `/Users/vinei/Projects/eventgate/backend/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

FROM base AS builder
COPY --from=ghcr.io/astral-sh/uv:0.4 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

FROM base AS runtime
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}"
COPY . .
RUN python manage.py collectstatic --noinput --settings=config.settings.prod || true
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
```

- [ ] **Step 2: Write .dockerignore**

Create `/Users/vinei/Projects/eventgate/backend/.dockerignore`:

```text
.venv
__pycache__
.pytest_cache
.mypy_cache
.ruff_cache
*.pyc
.env
.env.local
tests/
```

- [ ] **Step 3: Build the image locally**

```bash
cd /Users/vinei/Projects/eventgate/backend
docker build -t eventgate-backend:dev .
```

Expected: image builds without errors.

- [ ] **Step 4: Write fly.toml**

Create `/Users/vinei/Projects/eventgate/backend/fly.toml`:

```toml
app = "eventgate-backend-staging"
primary_region = "sin"

[build]

[env]
  DJANGO_SETTINGS_MODULE = "config.settings.prod"
  PORT = "8000"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

[[http_service.checks]]
  interval = "30s"
  timeout = "5s"
  grace_period = "10s"
  method = "GET"
  path = "/api/health/"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

- [ ] **Step 5: Commit**

```bash
cd /Users/vinei/Projects/eventgate
git add backend/Dockerfile backend/.dockerignore backend/fly.toml
git commit -m "feat(backend): add Dockerfile and Fly.io staging config"
```

---

## Task 19: Push to GitHub remote

**Files:** (no new files; sets up remote)

- [ ] **Step 1: Create the GitHub repo**

```bash
gh repo create eventgate --private --source=/Users/vinei/Projects/eventgate --remote=origin
```

Expected: repo created at `https://github.com/<you>/eventgate`. If you prefer a different name or org, substitute accordingly.

- [ ] **Step 2: Push main**

```bash
cd /Users/vinei/Projects/eventgate
git push -u origin main
```

Expected: push succeeds, GitHub Actions workflows trigger on the push.

- [ ] **Step 3: Verify CI runs**

```bash
gh run list --limit 5
```

Expected: two workflows queued/running (`backend`, `frontend`).

- [ ] **Step 4: Wait for CI to complete**

```bash
gh run watch
```

Expected: both workflows complete successfully (green check).

If any fail, read the logs (`gh run view --log <run-id>`), fix the issue, commit, push, and re-run.

---

## Task 20: Deploy backend to Fly.io (Singapore staging)

**Files:** (uses files from Task 18)

- [ ] **Step 1: Install flyctl if missing**

```bash
which flyctl || curl -L https://fly.io/install.sh | sh
flyctl version
```

Expected: `flyctl v0.x` or higher.

- [ ] **Step 2: Authenticate**

```bash
flyctl auth login
```

Follow the browser flow.

- [ ] **Step 3: Provision Neon Postgres (staging)**

Manual step in browser:
1. Sign up / log in at https://neon.tech
2. Create a new project named `eventgate-staging` in the **Singapore** region.
3. Copy the connection string with `?sslmode=require`.

Save the connection string — you'll set it as the `DATABASE_URL` secret in the next step.

- [ ] **Step 4: Provision Upstash Redis (staging)**

Manual step in browser:
1. Sign up / log in at https://upstash.com
2. Create a new Redis database in the **Singapore** region.
3. Copy the `redis://` connection string with TLS enabled.

- [ ] **Step 5: Set Fly secrets**

```bash
cd /Users/vinei/Projects/eventgate/backend
flyctl secrets set \
  SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(50))')" \
  DATABASE_URL="<your Neon URL>" \
  REDIS_URL="<your Upstash URL>" \
  CELERY_BROKER_URL="<your Upstash URL>" \
  CELERY_RESULT_BACKEND="<your Upstash URL>" \
  ALLOWED_HOSTS="eventgate-backend-staging.fly.dev" \
  SENTRY_ENVIRONMENT="staging" \
  --app eventgate-backend-staging
```

Substitute the actual values for placeholders.

- [ ] **Step 6: Launch the app**

```bash
cd /Users/vinei/Projects/eventgate/backend
flyctl apps create eventgate-backend-staging --org personal
flyctl deploy --remote-only
```

Expected: deploy completes; Fly assigns `https://eventgate-backend-staging.fly.dev`.

- [ ] **Step 7: Run migrations on staging**

```bash
cd /Users/vinei/Projects/eventgate/backend
flyctl ssh console -C "python manage.py migrate" --app eventgate-backend-staging
```

Expected: migrations apply successfully against Neon Postgres.

- [ ] **Step 8: Verify staging healthcheck**

```bash
curl -s https://eventgate-backend-staging.fly.dev/api/health/ | python -m json.tool
```

Expected:

```json
{
    "status": "ok",
    "version": "0.1.0",
    "database": "ok"
}
```

- [ ] **Step 9: Add Sentry DSN (optional but recommended)**

Manual: sign up at https://sentry.io, create a project named `eventgate-backend`, copy the DSN.

```bash
cd /Users/vinei/Projects/eventgate/backend
flyctl secrets set SENTRY_DSN="<your DSN>" --app eventgate-backend-staging
```

Wait ~30s for Fly to roll the secret, then trigger an intentional error to confirm:

```bash
flyctl ssh console -C "python -c 'import sentry_sdk; sentry_sdk.init(\"<DSN>\"); 1/0'" --app eventgate-backend-staging
```

Expected: an error appears in the Sentry project within a minute.

---

## Task 21: Deploy frontend to Vercel

**Files:** (no new files)

- [ ] **Step 1: Install Vercel CLI**

```bash
which vercel || pnpm add -g vercel
vercel --version
```

- [ ] **Step 2: Link project to Vercel**

```bash
cd /Users/vinei/Projects/eventgate/frontend
vercel link
```

Follow the prompts. Create a new project named `eventgate-frontend-staging`. Choose the `frontend` directory as root.

- [ ] **Step 3: Set env var**

```bash
cd /Users/vinei/Projects/eventgate/frontend
vercel env add NEXT_PUBLIC_API_BASE_URL production
# When prompted, enter: https://eventgate-backend-staging.fly.dev
vercel env add NEXT_PUBLIC_API_BASE_URL preview
# Same value.
```

- [ ] **Step 4: Configure backend CORS to allow Vercel domain**

Add to `/Users/vinei/Projects/eventgate/backend/pyproject.toml` dependencies:

```toml
  "django-cors-headers>=4.4,<5.0",
```

Run `uv sync` again.

Append to `/Users/vinei/Projects/eventgate/backend/config/settings/base.py`:

```python
INSTALLED_APPS += ["corsheaders"]
MIDDLEWARE.insert(0, "corsheaders.middleware.CorsMiddleware")
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
```

Update `.env.example`:

```ini
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

Deploy backend update:

```bash
cd /Users/vinei/Projects/eventgate/backend
flyctl secrets set CORS_ALLOWED_ORIGINS="https://eventgate-frontend-staging.vercel.app,https://eventgate-frontend-staging-*.vercel.app" --app eventgate-backend-staging
flyctl deploy --remote-only
```

Commit:

```bash
cd /Users/vinei/Projects/eventgate
git add backend/pyproject.toml backend/uv.lock backend/config/settings/base.py backend/.env.example
git commit -m "feat(backend): enable CORS for frontend origin"
git push
```

- [ ] **Step 5: Deploy frontend**

```bash
cd /Users/vinei/Projects/eventgate/frontend
vercel --prod
```

Expected: deploy succeeds; Vercel assigns `https://eventgate-frontend-staging.vercel.app` (or similar).

- [ ] **Step 6: Verify end-to-end**

Open `https://eventgate-frontend-staging.vercel.app` in a browser.

Expected: page renders "Eventgate", "Backend: ok", "Database: ok", "v0.1.0".

If the healthcheck card shows error or remains in loading state, open browser devtools network tab to confirm the request URL matches your Fly URL and CORS headers are present.

---

## Task 22: Plan A completion checklist

- [ ] **Step 1: Verify all green**

Run the full local verification one more time:

```bash
# Backend
cd /Users/vinei/Projects/eventgate/backend
uv run ruff check .
uv run ruff format --check .
uv run mypy apps config tests
uv run pytest -v

# Frontend
cd /Users/vinei/Projects/eventgate/frontend
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Expected: everything passes.

- [ ] **Step 2: Verify staging is alive**

```bash
curl -s https://eventgate-backend-staging.fly.dev/api/health/ | python -m json.tool
curl -sI https://eventgate-frontend-staging.vercel.app | head -1
```

Expected: backend returns `database: "ok"`, frontend returns `HTTP/2 200`.

- [ ] **Step 3: Commit anything outstanding and push**

```bash
cd /Users/vinei/Projects/eventgate
git status
git push
```

- [ ] **Step 4: Mark Plan A done**

Append to `/Users/vinei/Projects/eventgate/docs/plans/2026-05-19-plan-a-foundation-infrastructure.md` at the bottom:

```markdown
---

## Completion Log

- Completed: <YYYY-MM-DD>
- Repo: <github URL>
- Backend staging: https://eventgate-backend-staging.fly.dev
- Frontend staging: https://eventgate-frontend-staging.vercel.app
- Notes:
  - <any deviations from the plan>
  - <any follow-ups discovered>
```

Commit:

```bash
cd /Users/vinei/Projects/eventgate
git add docs/plans/2026-05-19-plan-a-foundation-infrastructure.md
git commit -m "docs(plan-a): completion log"
```

- [ ] **Step 5: Write Plan B**

Plan A is done. Next plan: **Plan B — Accounts, Orgs, Memberships, Magic-link Login** (~2 weeks). Request it from the planning assistant with "Write Plan B."

---

## Verification Summary

**What you should have at the end of Plan A:**

1. ✅ A new monorepo at `/Users/vinei/Projects/eventgate/` with `backend/` and `frontend/`.
2. ✅ Django 5 + DRF backend with healthcheck endpoint (`GET /api/health/`).
3. ✅ Next.js 14 + shadcn/ui frontend that renders the healthcheck status.
4. ✅ Local dev via `docker compose up -d` + `uv run manage.py runserver` + `pnpm dev`.
5. ✅ Backend tests passing under pytest; frontend tests passing under Vitest; one Playwright E2E.
6. ✅ Ruff + mypy clean on backend; ESLint + Prettier clean on frontend.
7. ✅ Pre-commit hooks installed.
8. ✅ GitHub Actions running lint + test on every push.
9. ✅ Backend deployed to Fly.io Singapore (`eventgate-backend-staging.fly.dev`).
10. ✅ Frontend deployed to Vercel (`eventgate-frontend-staging.vercel.app`).
11. ✅ Neon Postgres + Upstash Redis provisioned, Singapore region.
12. ✅ Sentry receiving events (optional but recommended).
13. ✅ End-to-end smoke: visiting the Vercel URL displays "Backend: ok / Database: ok" sourced from Fly through Neon.

**What is intentionally NOT in Plan A:**

- ❌ User accounts, login, magic-link (Plan B)
- ❌ Organizations, memberships, roles (Plan B)
- ❌ Events, registration forms (Plan C)
- ❌ Guests, tokens, QR generation (Plan C)
- ❌ Scanner PWA (Plan D)
- ❌ Offline sync (Plan E)
- ❌ i18n / Khmer support (added in Plan C when first guest-facing page exists)
- ❌ Multi-tenancy enforcement (`OrgScopedQuerySet`) — added in Plan B when there are tenants to scope

---

## Out-of-Plan Notes

**Parallel Phase-0 work (does not block Plan A or any later plan):**
- Brand-name shortlist: pick 5 abstract/global candidates, run `.com`/`.app` availability + USPTO/WIPO trademark search, then choose. Re-deploy on the chosen domain once selected.
- Set up an org email (e.g., `team@<chosen-domain>`) for Sentry, Vercel, Fly, Neon, Upstash, GitHub.

**Decision Heritage preserved by Plan A:**
- The repo is fresh; the existing MVP at `/Users/vinei/Projects/Paperless-Pre-check-in/` is untouched and continues to serve pilot #1.
- No product decisions from Appendix A of the brief are touched by infrastructure work — all preservation happens in Plans B–H.

**Next plan after this:**
Plan B — Accounts, Orgs, Memberships, Magic-link Login. Two weeks. Will introduce `apps/accounts`, `apps/orgs`, the `OrgScopedModel` base + `IsOrgMember` permission, magic-link auth, invite flow, and the first authenticated dashboard route.

---

## Completion Log

- **Completed:** 2026-05-20
- **Repo:** https://github.com/vineidev/eventgate (private)
- **Backend staging:** https://eventgate-backend-staging.fly.dev (Fly.io, region `sin`)
- **Frontend staging:** https://frontend-five-lovat-94.vercel.app (Vercel; deployment alias)
- **Database:** Neon Postgres (`ap-southeast-1`, Singapore)
- **Redis:** Fly Redis / Upstash (`fly-eventgate-redis-staging.upstash.io`)
- **Sentry:** wired to backend prod settings (DSN set as Fly secret)

### Deviations from the original plan

- **Next.js 16 + React 19 + Tailwind v4** (plan implied Next 14 + React 18 + Tailwind v3). `pnpm create next-app@latest` now scaffolds the modern stack. Compatible; shadcn supports it.
- **shadcn CLI** required `init -d` (defaults) flag — interactive prompts didn't accept piped input. Used preset `base-nova` instead of "Slate base color." Theme can be retuned later.
- **ESLint v9 flat config** (`eslint.config.mjs`) instead of `.eslintrc.json` — Next 16 removed `next lint`.
- **`.python-version` removed from `.gitignore`** — pinned Python version should be shared with the team. (Plan had it both gitignored and committed — internal contradiction fixed.)
- **`apps/common` skeleton brought forward into Task 3** — Django couldn't boot with `apps.common` in `INSTALLED_APPS` if the package didn't exist yet. Internal Task-3-vs-Task-5 ordering issue fixed.
- **Mypy `disable_error_code = ["import-untyped"]`** added to handle `django-environ` having no type stubs.
- **Pre-commit `frontend-lint` hook moved to `manual` stage** until Task 14 added the `pnpm lint` script. Re-enabled afterwards.
- **`ALLOWED_HOSTS=*` on Fly (staging only)** — Fly's Consul health-check uses the machine's internal hostname for the `Host` header, which `eventgate-backend-staging.fly.dev` doesn't match. Acceptable for staging; tighten before public launch.
- **Redis: Fly Redis (Upstash-backed) used instead of direct Upstash signup** — user chose this path; provisioned via `flyctl redis create` in Singapore.
- **GitHub repo lives under `vineidev` (not `vinei`)** — the active SSH key on the machine authenticates as `vineidev`. Empty `vinei/eventgate` placeholder was created and abandoned; can be deleted manually.
- **CORS configured at Task 21 instead of as a separate later step** — backend `CORS_ALLOWED_ORIGINS` Fly secret now lists both Vercel deployment URLs + `localhost:3000`.

### Verified end-to-end

```text
curl https://eventgate-backend-staging.fly.dev/api/health/
→ {"status":"ok","version":"0.1.0","database":"ok"}

curl -I https://frontend-five-lovat-94.vercel.app
→ HTTP/2 200

curl -I -H "Origin: https://frontend-five-lovat-94.vercel.app" https://eventgate-backend-staging.fly.dev/api/health/
→ access-control-allow-origin: https://frontend-five-lovat-94.vercel.app
```

### Follow-ups for Plan B (parking lot)

- Tighten `ALLOWED_HOSTS` to `eventgate-backend-staging.fly.dev,<internal-fqdn>` once we know the right Fly internal Host header.
- Delete the abandoned `vinei/eventgate` repo (needs `gh auth refresh -s delete_repo`).
- Pick the brand name from §14 of the brief and rename: GitHub repo, Fly app, Vercel project, Sentry project.
- Rotate the Fly and Vercel API tokens that were pasted in chat.
- Add a `Makefile` or `mise.toml` at the monorepo root for `make dev`, `make test`, `make deploy-staging`.
- Add database backup policy (Neon's PITR is on free tier — verify settings).
- Re-evaluate `ALLOWED_HOSTS=*` security implications before any production data lands.
