"""Base settings — shared across dev, prod, test."""

from datetime import timedelta
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
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "anymail",
    "apps.common",
    "apps.accounts",
    "apps.orgs",
    "apps.notifications",
    "apps.integrations",
    "apps.events",
    "apps.guests",
    "apps.audit",
    "apps.analytics",
    "apps.devices",
    "apps.checkins",
    "apps.walkins",
    "apps.scanner",
    "apps.helpdesk",
    "apps.shorturls",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
# Required because the frontend uses fetch(..., { credentials: "include" }) to
# carry JWT cookies. Without this header on the response, browsers silently
# reject the request with "Failed to fetch".
CORS_ALLOW_CREDENTIALS = True

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

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")
REDIS_PUBLISH_SOCKET_CONNECT_TIMEOUT = env.float(
    "REDIS_PUBLISH_SOCKET_CONNECT_TIMEOUT", default=0.5
)
REDIS_PUBLISH_SOCKET_TIMEOUT = env.float("REDIS_PUBLISH_SOCKET_TIMEOUT", default=0.5)

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
    }
}

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_PARSER_CLASSES": ("rest_framework.parsers.JSONParser",),
    "DEFAULT_AUTHENTICATION_CLASSES": ("apps.accounts.authentication.CookieJWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
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

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/2")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
# All tasks are fire-and-forget (`.delay()` only — nothing reads AsyncResult), so
# storing results just burns per-command writes on the Redis result backend. Drop
# them. Note: this does NOT affect task retries (those go through the broker).
CELERY_TASK_IGNORE_RESULT = True
# When set true (e.g. on staging with no separate worker), tasks run synchronously
# inside the web process. Production should run a dedicated Celery worker — Plan D.
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TASK_EAGER_PROPAGATES = env.bool("CELERY_TASK_EAGER_PROPAGATES", default=False)

# Periodic schedule — requires `celery -A config beat` (or worker --beat) to run.
CELERY_BEAT_SCHEDULE = {
    "sweep-preview-imports": {
        "task": "guests.sweep_preview_imports",
        "schedule": 60 * 60 * 24,  # daily — deletes CsvImport preview rows older than 24h
    },
}

# Auth
AUTH_USER_MODEL = "accounts.User"

# Console email backend at MVP — magic links print to logs. Real email in Plan C.
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Eventgate <noreply@mail.byondr.co>")

# SimpleJWT
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),  # was minutes=15; Plan K item #8a
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# Cookie-based JWT
# Production hardening: set JWT_COOKIE_SECURE=True and JWT_COOKIE_SAMESITE=Strict
# (or None+Secure for cross-site SPA flows) via env vars. Defaults below are
# dev-friendly only.
JWT_ACCESS_COOKIE = "eventgate_access"
JWT_REFRESH_COOKIE = "eventgate_refresh"
JWT_COOKIE_SECURE = env.bool("JWT_COOKIE_SECURE", default=False)
JWT_COOKIE_SAMESITE = env("JWT_COOKIE_SAMESITE", default="Lax")
JWT_COOKIE_DOMAIN = env("JWT_COOKIE_DOMAIN", default=None)

# Magic-link
MAGIC_LINK_TTL_MINUTES = 15
MAGIC_LINK_FRONTEND_URL = env("MAGIC_LINK_FRONTEND_URL", default="http://localhost:3000")

# Public base URL — used by walk-in QR codes (their URL points back at the
# frontend's /e/<org>/<event>/claim/<token>/ page). Falls back to
# MAGIC_LINK_FRONTEND_URL for environments that already set that one.
PUBLIC_BASE_URL = env(
    "PUBLIC_BASE_URL", default=env("MAGIC_LINK_FRONTEND_URL", default="http://localhost:3000")
)

# Invites
INVITE_TTL_HOURS = 72

# Telegram bot (Plan G W12). All four are optional; absent values disable the feature.
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", default="")
TELEGRAM_BOT_USERNAME = env("TELEGRAM_BOT_USERNAME", default="")
TELEGRAM_WEBHOOK_SECRET = env("TELEGRAM_WEBHOOK_SECRET", default="")
TELEGRAM_WEBHOOK_URL = env("TELEGRAM_WEBHOOK_URL", default="")
