from __future__ import annotations

from collections.abc import AsyncIterator
import ssl
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from config import settings


def _normalized_sqlalchemy_url(raw_url: str | None = None) -> tuple[str, dict[str, object]]:
    url = raw_url or settings.resolved_database_url
    if not url:
        raise RuntimeError("DATABASE_URL or SUPABASE_DB_URL is required")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]

    connect_args: dict[str, object] = {"statement_cache_size": 0}
    split = urlsplit(url)
    query = dict(parse_qsl(split.query, keep_blank_values=True))
    sslmode = query.pop("sslmode", None)
    if sslmode and "ssl" not in query:
        normalized_sslmode = sslmode.lower()
        if normalized_sslmode == "require":
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            connect_args["ssl"] = context
        elif normalized_sslmode in {"verify-ca", "verify-full"}:
            connect_args["ssl"] = True
    normalized = urlunsplit((split.scheme, split.netloc, split.path, urlencode(query), split.fragment))
    return normalized, connect_args


def sqlalchemy_database_url(raw_url: str | None = None) -> str:
    return _normalized_sqlalchemy_url(raw_url)[0]


def sqlalchemy_connect_args(raw_url: str | None = None) -> dict[str, object]:
    return _normalized_sqlalchemy_url(raw_url)[1]


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(sqlalchemy_database_url(), pool_pre_ping=True, connect_args=sqlalchemy_connect_args())
    return _engine


def sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _sessionmaker


async def get_session() -> AsyncIterator[AsyncSession]:
    async with sessionmaker()() as session:
        yield session
