import importlib

import pytest


@pytest.mark.django_db
def test_healthcheck_returns_ok(api_client) -> None:
    response = api_client.get("/api/health/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert body["database"] == "ok"


@pytest.mark.django_db
def test_liveness_makes_no_db_query(api_client, django_assert_num_queries) -> None:
    """The liveness probe (Fly's 30s check) must not touch Postgres, so Neon's
    autosuspend can fire during idle periods. See apps/common/views.LivenessView."""
    with django_assert_num_queries(0):
        response = api_client.get("/api/health/live/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert "database" not in body


def test_prod_settings_import_without_sentry_dsn(monkeypatch) -> None:
    """Importing prod settings with no SENTRY_DSN must not crash."""
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.prod")
    monkeypatch.setenv("SECRET_KEY", "test")
    monkeypatch.setenv("ALLOWED_HOSTS", "test.example.com")
    monkeypatch.setenv("DATABASE_URL", "postgres://eventgate:eventgate@localhost:5432/eventgate")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")

    import config.settings.prod

    importlib.reload(config.settings.prod)


def test_celery_ping_task() -> None:
    from apps.common.tasks import ping

    result = ping.delay()
    assert result.get(timeout=2) == "pong"
