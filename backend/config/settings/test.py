"""Test settings — fast, isolated."""

import os
import tempfile
from pathlib import Path

from .base import *  # noqa: F403

DEBUG = False
SECRET_KEY = "test-insecure-secret"

# Sandbox file uploads so tests never pollute the working tree.
# Wrap tempfile.mkdtemp (returns str) in Path() to match the MEDIA_ROOT
# type from base.py (BASE_DIR / "media", a Path). Caught by `mypy apps config`
# in CI; the prior `mypy apps/` scope didn't include settings.
MEDIA_ROOT = Path(tempfile.mkdtemp(prefix="eventgate-test-media-"))

# Intentional Plan H holdout: NAME/USER/PASSWORD must match the postgres
# service credentials in .github/workflows/backend.yml. Rename in lockstep
# with the CI workflow when the prod env split (Plan H deferred half) lands.
#
# HOST/PORT are env-overridable (default localhost:5432). When you run this
# project's local Postgres on a non-default host port — to avoid colliding with
# another project also using 5432 — set POSTGRES_PORT (and POSTGRES_HOST if
# needed) in backend/.env and tests follow it. CI leaves them unset, so it keeps
# using localhost:5432.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "eventgate_test",
        "USER": "eventgate",
        "PASSWORD": "eventgate",
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
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

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
