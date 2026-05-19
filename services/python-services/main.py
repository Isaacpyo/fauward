from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import db
from config import settings
from lib.json_logging import configure_logging

configure_logging()

try:
    from prometheus_fastapi_instrumentator import Instrumentator
except ModuleNotFoundError:
    class Instrumentator:  # type: ignore[no-redef]
        def instrument(self, app: FastAPI) -> "Instrumentator":
            return self

        def expose(self, app: FastAPI, endpoint: str = "/metrics") -> None:
            return None

limiter = Limiter(key_func=get_remote_address, storage_uri=settings.redis_url)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await db.connect_db()
    try:
        yield
    finally:
        await db.close_db()


app = FastAPI(
    title="Fauward Python Services",
    version="0.1.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from api.analytics import router as analytics_router  # noqa: E402
from api.customs import router as customs_router  # noqa: E402
from api.health import router as health_router  # noqa: E402
from api.metrics import router as metrics_router  # noqa: E402
from api.ml import router as ml_router  # noqa: E402
from api.observability import router as observability_router  # noqa: E402
from api.ocr import router as ocr_router  # noqa: E402
from api.pdf import router as pdf_router  # noqa: E402
from api.pricing import router as pricing_router  # noqa: E402
from api.routes import router as routes_router  # noqa: E402

app.include_router(pdf_router)
app.include_router(routes_router)
app.include_router(analytics_router)
app.include_router(ocr_router)
app.include_router(pricing_router)
app.include_router(customs_router)
app.include_router(ml_router)
app.include_router(metrics_router)
app.include_router(health_router)
app.include_router(observability_router)

Instrumentator().instrument(app).expose(app, endpoint="/metrics")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
