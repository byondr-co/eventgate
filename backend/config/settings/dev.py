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
