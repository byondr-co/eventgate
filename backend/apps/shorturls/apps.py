from django.apps import AppConfig


class ShortUrlsConfig(AppConfig):
    name = "apps.shorturls"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from apps.shorturls import signals  # noqa: F401
