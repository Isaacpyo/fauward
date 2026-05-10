from datetime import datetime, timezone

import structlog
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.eta_model import get_eta_predictor
from app.optimizer import RouteOptimizer
from app.schemas import (
    EtaTrainRequest,
    EtaTrainResponse,
    HealthResponse,
    OptimizeRequest,
    OptimizeResponse,
)

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)

logger = structlog.get_logger()

app = FastAPI(
    title="Fauward Route Optimizer",
    description="Route optimization microservice — nearest-neighbour + 2-opt with optional ML ETA",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Root"])
async def root():
    return {"service": "Fauward Route Optimizer", "version": "1.0.0", "docs": "/docs"}


@app.get("/v1/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    predictor = get_eta_predictor()
    return HealthResponse(ok=True, version="1.0.0", etaModelLoaded=predictor.is_loaded())


@app.post("/v1/optimize", response_model=OptimizeResponse, tags=["Optimization"])
async def optimize_route(request: OptimizeRequest):
    try:
        logger.info("optimize_request", request_id=request.requestId, num_stops=len(request.stops), objective=request.options.objective.value)

        eta_predictor = None
        if request.options.useEtaModel:
            predictor = get_eta_predictor()
            if predictor.is_loaded():
                eta_predictor = predictor

        vehicle_start = (request.vehicle.start.lat, request.vehicle.start.lng)
        vehicle_end = (request.vehicle.end.lat, request.vehicle.end.lng) if request.vehicle.end else None

        optimizer = RouteOptimizer(
            vehicle_start=vehicle_start,
            vehicle_end=vehicle_end,
            stops=request.stops,
            objective=request.options.objective,
            seed=request.options.seed or 42,
            constraints={"maxStops": request.constraints.maxStops, "maxKm": request.constraints.maxKm, "maxMinutes": request.constraints.maxMinutes},
            use_eta_model=request.options.useEtaModel and eta_predictor is not None,
            eta_predictor=eta_predictor,
        )

        route_result, explanation = optimizer.optimize(datetime.now(timezone.utc))

        logger.info("optimize_success", request_id=request.requestId, total_distance_km=route_result.totalDistanceKm, feasible=route_result.feasible)

        return OptimizeResponse(
            requestId=request.requestId,
            route=route_result,
            explain=explanation if request.options.explain else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("optimize_error", request_id=request.requestId, error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Optimization failed: {str(e)}")


@app.post("/v1/eta/train", response_model=EtaTrainResponse, tags=["ETA Model"])
async def train_eta_model(request: EtaTrainRequest):
    try:
        logger.info("eta_train_request", num_rows=len(request.rows))

        if len(request.rows) < 10:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Need at least 10 training samples")

        predictor = get_eta_predictor()
        rows_used = predictor.train(
            [r.fromLat for r in request.rows],
            [r.fromLng for r in request.rows],
            [r.toLat for r in request.rows],
            [r.toLng for r in request.rows],
            [r.departedAt for r in request.rows],
            [r.arrivedAt for r in request.rows],
        )

        logger.info("eta_train_success", rows_used=rows_used)
        return EtaTrainResponse(trained=True, rowsUsed=rows_used, modelPath="data/model.joblib")

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error("eta_train_error", error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Training failed: {str(e)}")


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error("unhandled_exception", error=str(exc))
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "Internal server error"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
