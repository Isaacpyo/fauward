from pathlib import Path

import pytest

import db
from api import health


@pytest.mark.asyncio
async def test_health_live():
    assert await health.live() == {"status": "alive"}


@pytest.mark.asyncio
async def test_health_ready_success(monkeypatch):
    async def fake_fetchval(query, *args):
        return 1

    monkeypatch.setattr(db, "fetchval", fake_fetchval)
    monkeypatch.setattr(health, "_redis_ping", lambda: True)

    response = await health.ready()

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_ready_safe_failure(monkeypatch):
    async def fake_fetchval(query, *args):
        raise RuntimeError("postgres://secret")

    monkeypatch.setattr(db, "fetchval", fake_fetchval)
    monkeypatch.setattr(health, "_redis_ping", lambda: False)

    response = await health.ready()

    assert response.status_code == 503
    assert b"secret" not in response.body


def test_refactor_layer_directories_exist():
    root = Path("services/python-services")

    for relative in ["api/deps.py", "core", "schemas", "services/tenant_access.py", "repositories", "migrations/versions"]:
        assert (root / relative).exists()
