"""Test settings — fast, isolated."""

import tempfile

from .base import *  # noqa: F403

DEBUG = False
SECRET_KEY = "test-insecure-secret"

# Sandbox file uploads so tests never pollute the working tree.
MEDIA_ROOT = tempfile.mkdtemp(prefix="gatethres-test-media-")

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

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
