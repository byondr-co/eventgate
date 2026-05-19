import pytest


@pytest.mark.django_db
def test_healthcheck_returns_ok(api_client) -> None:
    response = api_client.get("/api/health/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert body["database"] == "ok"
