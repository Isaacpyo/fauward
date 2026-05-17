import inspect
from pathlib import Path

import pytest
from fastapi import HTTPException

from api.auth import AuthContext
from api.metrics import require_queue_metrics_access
from services.queue_metrics import (
    DEFAULT_QUEUE_TO_DONE_QUEUE,
    monitored_queues,
    queue_depth_gauge_value,
    queue_depths_response,
)


class FakeRedis:
    def __init__(self, values):
        self.values = values
        self.requested = []

    def llen(self, queue):
        self.requested.append(queue)
        return self.values.get(queue, "0")


def tenant_auth(scopes=("metrics:read",)) -> AuthContext:
    return AuthContext(tenant_id="tenant_a", scopes=scopes, key_type="tenant", api_key_id="tenant_key")


def admin_auth() -> AuthContext:
    return AuthContext(tenant_id="platform", scopes=("platform:admin",), key_type="platform", api_key_id="platform_key")


def ops_auth() -> AuthContext:
    return AuthContext(tenant_id="platform", scopes=("metrics:read",), key_type="ops", api_key_id="ops_key")


@pytest.mark.asyncio
async def test_metrics_queues_requires_auth_dependency():
    source = Path("services/python-services/api/metrics.py").read_text()

    assert "Depends(require_queue_metrics_access)" in source
    assert "require_bearer_token" in source


@pytest.mark.asyncio
async def test_normal_tenant_bearer_token_is_rejected():
    with pytest.raises(HTTPException) as exc:
        await require_queue_metrics_access(tenant_auth())

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_super_admin_can_fetch_queue_metrics():
    assert await require_queue_metrics_access(admin_auth()) == admin_auth()


@pytest.mark.asyncio
async def test_platform_ops_metrics_scope_can_fetch_queue_metrics():
    assert await require_queue_metrics_access(ops_auth()) == ops_auth()


@pytest.mark.asyncio
async def test_queue_depths_return_source_done_and_dead_queues():
    values = {queue: str(index) for index, queue in enumerate(monitored_queues(), start=1)}
    client = FakeRedis(values)

    response = await queue_depths_response(lambda: client)

    assert set(response["queues"]) == set(monitored_queues())
    for source_queue, done_queue in DEFAULT_QUEUE_TO_DONE_QUEUE.items():
        assert source_queue in response["queues"]
        assert done_queue in response["queues"]
        assert f"{source_queue}:dead" in response["queues"]
    assert response["updatedAt"]


@pytest.mark.asyncio
async def test_redis_llen_values_are_converted_to_ints():
    client = FakeRedis({queue: "7" for queue in monitored_queues()})

    response = await queue_depths_response(lambda: client)

    assert all(value == 7 for value in response["queues"].values())


@pytest.mark.asyncio
async def test_redis_failure_returns_safe_503():
    class FailingRedis:
        def llen(self, queue):
            raise RuntimeError("redis://secret-host:6379 password=secret")

    with pytest.raises(HTTPException) as exc:
        await queue_depths_response(lambda: FailingRedis())

    assert exc.value.status_code == 503
    assert exc.value.detail == "Queue metrics are unavailable"
    assert "secret" not in str(exc.value.detail)


@pytest.mark.asyncio
async def test_prometheus_gauge_is_updated_with_queue_depth_values():
    queue = monitored_queues()[0]
    client = FakeRedis({name: "0" for name in monitored_queues()} | {queue: "42"})

    await queue_depths_response(lambda: client)

    assert queue_depth_gauge_value(queue) == 42


def test_no_user_provided_queue_names_are_accepted():
    signature = inspect.signature(queue_depths_response)

    assert "queue" not in signature.parameters
    assert monitored_queues() == [
        *DEFAULT_QUEUE_TO_DONE_QUEUE.keys(),
        *DEFAULT_QUEUE_TO_DONE_QUEUE.values(),
        *[f"{queue}:dead" for queue in DEFAULT_QUEUE_TO_DONE_QUEUE.keys()],
    ]
