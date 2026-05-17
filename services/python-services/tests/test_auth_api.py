import pytest
from fastapi import HTTPException

import db
from api.auth import (
    AuthContext,
    normalize_scopes,
    require_any_scope,
    require_bearer_token,
    require_scope,
    require_super_admin,
)


@pytest.mark.asyncio
async def test_missing_authorization_header_returns_401():
    with pytest.raises(HTTPException) as exc:
        await require_bearer_token(None)

    assert exc.value.status_code == 401
    assert exc.value.headers == {"WWW-Authenticate": "Bearer"}


@pytest.mark.asyncio
async def test_malformed_authorization_header_returns_401():
    with pytest.raises(HTTPException) as exc:
        await require_bearer_token("Basic abc")

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_empty_bearer_token_returns_401():
    with pytest.raises(HTTPException) as exc:
        await require_bearer_token("Bearer ")

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_invalid_api_key_returns_401(monkeypatch):
    async def fake_validate_api_key(token):
        return None

    monkeypatch.setattr(db, "validate_api_key", fake_validate_api_key)

    with pytest.raises(HTTPException) as exc:
        await require_bearer_token("Bearer invalid")

    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid API key"


@pytest.mark.asyncio
async def test_valid_tenant_api_key_returns_auth_context(monkeypatch):
    async def fake_validate_api_key(token):
        assert token == "valid-token"
        return {
            "tenant_id": "tenant_a",
            "scopes": ["ML:Read", " pdf:generate "],
            "api_key_id": "key_1",
            "user_id": "user_1",
            "actor_id": "actor_1",
            "key_type": "tenant",
        }

    monkeypatch.setattr(db, "validate_api_key", fake_validate_api_key)

    auth = await require_bearer_token("Bearer valid-token")

    assert auth.tenant_id == "tenant_a"
    assert auth.scopes == ("ml:read", "pdf:generate")
    assert auth.api_key_id == "key_1"
    assert auth.user_id == "user_1"
    assert auth.actor_id == "actor_1"
    assert auth.key_type == "tenant"


def test_scopes_are_normalized_from_list_input():
    auth = AuthContext(tenant_id="tenant_a", scopes=[" ML:Read ", "ml:read", "PDF:Generate"])

    assert auth.scopes == ("ml:read", "pdf:generate")


def test_scopes_are_normalized_from_string_input():
    assert normalize_scopes("ml:read, PDF:Generate analytics:read") == (
        "ml:read",
        "pdf:generate",
        "analytics:read",
    )


def test_tenant_key_with_admin_scope_is_not_super_admin():
    auth = AuthContext(tenant_id="tenant_a", scopes=("platform:admin",), key_type="tenant")

    assert auth.is_super_admin is False


def test_platform_key_with_platform_admin_is_super_admin():
    auth = AuthContext(tenant_id="tenant_a", scopes=("platform:admin",), key_type="platform")

    assert auth.is_super_admin is True


@pytest.mark.asyncio
async def test_require_super_admin_blocks_normal_tenant():
    with pytest.raises(HTTPException) as exc:
        await require_super_admin(AuthContext(tenant_id="tenant_a", scopes=("ml:read",), key_type="tenant"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_super_admin_allows_platform_admin():
    auth = AuthContext(tenant_id="tenant_a", scopes=("platform:admin",), key_type="platform")

    assert await require_super_admin(auth) is auth


@pytest.mark.asyncio
async def test_require_scope_allows_required_scope():
    auth = AuthContext(tenant_id="tenant_a", scopes=("pdf:generate",), key_type="tenant")
    dependency = require_scope("PDF:Generate")

    assert await dependency(auth) is auth


@pytest.mark.asyncio
async def test_require_scope_blocks_missing_scope():
    dependency = require_scope("pdf:generate")

    with pytest.raises(HTTPException) as exc:
        await dependency(AuthContext(tenant_id="tenant_a", scopes=("ml:read",), key_type="tenant"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_any_scope_allows_super_admin_without_specific_scope():
    auth = AuthContext(tenant_id="tenant_a", scopes=("platform:admin",), key_type="platform")
    dependency = require_any_scope(["pdf:generate", "analytics:read"])

    assert await dependency(auth) is auth


@pytest.mark.asyncio
async def test_validate_api_key_uses_hash_prefix_revocation_expiry_and_tenant_status(monkeypatch):
    raw_key = "fw_1234567890"
    hashed = db.api_key_hash(raw_key)
    fetch_calls = []
    execute_calls = []

    async def fake_table_exists(table_name):
        return table_name in {"api_keys", "tenants"}

    async def fake_column_exists(table_name, column_name):
        return (table_name, column_name) in {
            ("api_keys", "keyPrefix"),
            ("api_keys", "revokedAt"),
            ("api_keys", "userId"),
            ("api_keys", "keyType"),
            ("tenants", "status"),
        }

    async def fake_fetch(query, *args):
        fetch_calls.append((query, args))
        return [
            {
                "api_key_id": "key_1",
                "tenant_id": "tenant_a",
                "key_hash": hashed,
                "scopes": "ml:read",
                "user_id": "user_1",
                "actor_id": None,
                "key_type": "tenant",
            }
        ]

    async def fake_execute(query, *args):
        execute_calls.append((query, args))
        return "UPDATE 1"

    monkeypatch.setattr(db, "table_exists", fake_table_exists)
    monkeypatch.setattr(db, "column_exists", fake_column_exists)
    monkeypatch.setattr(db, "fetch", fake_fetch)
    monkeypatch.setattr(db, "execute", fake_execute)

    result = await db.validate_api_key(raw_key)

    query, args = fetch_calls[0]
    assert 'k."keyPrefix" = $1' in query
    assert 'k."revokedAt" is null' in query
    assert '(k."expiresAt" is null or k."expiresAt" > now())' in query
    assert "t.status not in ('SUSPENDED', 'CANCELLED', 'DELETED')" in query
    assert args == (raw_key[:8],)
    assert execute_calls[0][1] == ("key_1",)
    assert result == {
        "tenant_id": "tenant_a",
        "scopes": "ml:read",
        "api_key_id": "key_1",
        "user_id": "user_1",
        "actor_id": None,
        "key_type": "tenant",
    }


@pytest.mark.asyncio
async def test_validate_api_key_rejects_hash_mismatch(monkeypatch):
    async def fake_table_exists(table_name):
        return table_name == "api_keys"

    async def fake_column_exists(table_name, column_name):
        return column_name == "keyPrefix"

    async def fake_fetch(query, *args):
        return [
            {
                "api_key_id": "key_1",
                "tenant_id": "tenant_a",
                "key_hash": "different",
                "scopes": [],
                "user_id": None,
                "actor_id": None,
                "key_type": "tenant",
            }
        ]

    async def fail_execute(*args):
        raise AssertionError("lastUsed should not update for an invalid key")

    monkeypatch.setattr(db, "table_exists", fake_table_exists)
    monkeypatch.setattr(db, "column_exists", fake_column_exists)
    monkeypatch.setattr(db, "fetch", fake_fetch)
    monkeypatch.setattr(db, "execute", fail_execute)

    assert await db.validate_api_key("fw_1234567890") is None


@pytest.mark.asyncio
async def test_raw_token_is_not_included_in_errors(monkeypatch):
    raw = "secret-token-value"

    async def fake_validate_api_key(token):
        return None

    monkeypatch.setattr(db, "validate_api_key", fake_validate_api_key)

    with pytest.raises(HTTPException) as exc:
        await require_bearer_token(f"Bearer {raw}")

    assert raw not in str(exc.value.detail)
    assert raw not in str(exc.value.headers)
