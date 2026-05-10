from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class StopType(str, Enum):
    PICKUP = "PICKUP"
    DROPOFF = "DROPOFF"


class Priority(str, Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"


class Objective(str, Enum):
    MIN_TIME = "MIN_TIME"
    MIN_DISTANCE = "MIN_DISTANCE"
    BALANCED = "BALANCED"


class ViolationType(str, Enum):
    TIME_WINDOW_MISSED = "TIME_WINDOW_MISSED"
    CAPACITY = "CAPACITY"
    MAX_KM = "MAX_KM"
    MAX_MINUTES = "MAX_MINUTES"


class Coordinate(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class TimeWindow(BaseModel):
    start: Optional[datetime] = None
    end: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_window(self):
        if self.start and self.end and self.start >= self.end:
            raise ValueError("Time window start must be before end")
        return self


class Stop(BaseModel):
    id: str
    type: StopType
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    serviceMinutes: float = Field(default=5.0, ge=0)
    timeWindow: Optional[TimeWindow] = None
    priority: Priority = Priority.NORMAL

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Stop ID cannot be empty")
        return v.strip()


class Vehicle(BaseModel):
    start: Coordinate
    end: Optional[Coordinate] = None
    capacity: Optional[float] = Field(default=None, ge=0)


class Constraints(BaseModel):
    maxStops: Optional[int] = Field(default=None, ge=1)
    maxKm: Optional[float] = Field(default=None, ge=0)
    maxMinutes: Optional[float] = Field(default=None, ge=0)


class OptimizationOptions(BaseModel):
    objective: Objective = Objective.BALANCED
    seed: Optional[int] = 42
    explain: bool = False
    useEtaModel: bool = True


class OptimizeRequest(BaseModel):
    requestId: str
    vehicle: Vehicle
    constraints: Constraints = Field(default_factory=Constraints)
    stops: List[Stop] = Field(..., min_length=1)
    options: OptimizationOptions = Field(default_factory=OptimizationOptions)

    @field_validator("stops")
    @classmethod
    def validate_unique_ids(cls, v: List[Stop]) -> List[Stop]:
        ids = [s.id for s in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Stop IDs must be unique")
        return v

    @model_validator(mode="after")
    def validate_constraints(self):
        if self.constraints.maxStops and len(self.stops) > self.constraints.maxStops:
            raise ValueError(
                f"Number of stops ({len(self.stops)}) exceeds maxStops ({self.constraints.maxStops})"
            )
        return self


class Leg(BaseModel):
    model_config = {"populate_by_name": True}

    fromId: str = Field(..., alias="from")
    toId: str = Field(..., alias="to")
    distanceKm: float = Field(..., ge=0)
    durationMinutes: float = Field(..., ge=0)
    eta: datetime


class Violation(BaseModel):
    stopId: str
    reason: ViolationType
    details: Optional[str] = None


class RouteResult(BaseModel):
    orderedStopIds: List[str]
    legs: List[Leg]
    totalDistanceKm: float = Field(..., ge=0)
    totalDurationMinutes: float = Field(..., ge=0)
    feasible: bool
    violations: List[Violation] = Field(default_factory=list)


class ExplanationScore(BaseModel):
    distanceKm: float
    durationMinutes: float
    violationPenalty: float = 0.0


class Explanation(BaseModel):
    algorithm: str
    notes: List[str] = Field(default_factory=list)
    score: ExplanationScore


class OptimizeResponse(BaseModel):
    requestId: str
    route: RouteResult
    explain: Optional[Explanation] = None


class EtaTrainingRow(BaseModel):
    fromLat: float = Field(..., ge=-90, le=90)
    fromLng: float = Field(..., ge=-180, le=180)
    toLat: float = Field(..., ge=-90, le=90)
    toLng: float = Field(..., ge=-180, le=180)
    departedAt: datetime
    arrivedAt: datetime

    @model_validator(mode="after")
    def validate_times(self):
        if self.departedAt >= self.arrivedAt:
            raise ValueError("departedAt must be before arrivedAt")
        return self


class EtaTrainRequest(BaseModel):
    rows: List[EtaTrainingRow] = Field(..., min_length=1)


class EtaTrainResponse(BaseModel):
    trained: bool
    rowsUsed: int = Field(..., ge=0)
    modelPath: Optional[str] = None


class HealthResponse(BaseModel):
    ok: bool
    version: str = "1.0.0"
    etaModelLoaded: bool = False
