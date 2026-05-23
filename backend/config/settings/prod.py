"""Production settings — staging + production."""

import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.django import DjangoIntegration

from .base import *  # noqa: F403
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

# Resend email (anymail). Falls back to console backend if RESEND_API_KEY is unset.
RESEND_API_KEY = env("RESEND_API_KEY", default="")
if RESEND_API_KEY:
    EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"
    ANYMAIL = {"RESEND_API_KEY": RESEND_API_KEY}

# Object storage: Fly Tigris (S3-compatible). Required for multi-machine deploys
# because each Machine has its own ephemeral filesystem — the `app` Machine
# writes uploads (CSV imports etc.) but the `worker` Machine can't read them
# without a shared store. `flyctl storage create` provisions a bucket and
# injects AWS_*+BUCKET_NAME as Fly secrets. Falls back to local filesystem if
# BUCKET_NAME is missing (so single-machine dev / staging-without-storage still
# works).
BUCKET_NAME = env("BUCKET_NAME", default="")
if BUCKET_NAME:
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                "access_key": env("AWS_ACCESS_KEY_ID"),
                "secret_key": env("AWS_SECRET_ACCESS_KEY"),
                "bucket_name": BUCKET_NAME,
                "endpoint_url": env("AWS_ENDPOINT_URL_S3"),
                "region_name": env("AWS_REGION", default="auto"),
                "default_acl": "private",
                "file_overwrite": False,
                "querystring_auth": True,
            },
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
