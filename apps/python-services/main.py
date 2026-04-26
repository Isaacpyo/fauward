from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

import db
from api.analytics import router as analytics_router
from api.customs import router as customs_router
from api.ml import router as ml_router
from api.ocr import router as ocr_router
from api.pdf import router as pdf_router
from api.pricing import router as pricing_router
from api.routes import router as routes_router
from lib.json_logging import configure_logging

configure_logging()


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

app.include_router(pdf_router)
app.include_router(routes_router)
app.include_router(analytics_router)
app.include_router(ocr_router)
app.include_router(pricing_router)
app.include_router(customs_router)
app.include_router(ml_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
