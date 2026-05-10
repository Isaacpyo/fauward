from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

RouteStatus = Literal["QUEUED", "PROCESSING", "COMPLETED", "FAILED"]

MAX_STOPS = 100
MAX_VEHICLE_CAPACITY_KG = Decimal("50000")
MAX_STOP_WEIGHT_KG = Decimal("5000")


def _parse_time_window(value: str) -> datetime | None:
    normalized = value.strip()
    if not normalized:
        return None
    if "T" in normalized:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("Time windows must include timezone offsets")
        return parsed
    # Backward compatibility: HH:MM is treated as the service day's local clock time.
    parsed_time = datetime.strptime(normalized, "%H:%M").time()
    return datetime(2000, 1, 1, parsed_time.hour, parsed_time.minute, parsed_time.second)


class RoutePoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class RouteStop(RoutePoint):
    shipmentId: str = Field(min_length=1, max_length=128)
    timeWindowStart: str | None = Field(default=None, max_length=64)
    timeWindowEnd: str | None = Field(default=None, max_length=64)
    weightKg: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), le=MAX_STOP_WEIGHT_KG)

    @field_validator("shipmentId")
    @classmethod
    def normalize_shipment_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("shipmentId is required")
        return normalized

    @field_validator("timeWindowStart", "timeWindowEnd")
    @classmethod
    def normalize_time_window(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        _parse_time_window(normalized)
        return normalized

    @model_validator(mode="after")
    def validate_time_window_order(self) -> "RouteStop":
        if self.timeWindowStart and self.timeWindowEnd:
            if _parse_time_window(self.timeWindowStart) >= _parse_time_window(self.timeWindowEnd):  # type: ignore[operator]
                raise ValueError("timeWindowStart must be before timeWindowEnd")
        return self


class OptimizeRouteRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tenantId: str = Field(min_length=1, max_length=128)
    vehicleId: str | None = Field(default=None, min_length=1, max_length=128)
    depot: RoutePoint
    stops: list[RouteStop] = Field(min_length=1, max_length=MAX_STOPS)
    vehicleCapacityKg: Decimal = Field(gt=Decimal("0"), le=MAX_VEHICLE_CAPACITY_KG)
    idempotencyKey: str | None = Field(default=None, min_length=8, max_length=200)

    @field_validator("tenantId")
    @classmethod
    def trim_tenant_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("tenantId is required")
        return normalized

    @field_validator("vehicleId", "idempotencyKey")
    @classmethod
    def trim_optional_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_stops(self) -> "OptimizeRouteRequest":
        seen: set[str] = set()
        for stop in self.stops:
            if stop.shipmentId in seen:
                raise ValueError("Duplicate shipmentId values are not allowed")
            seen.add(stop.shipmentId)
        total_weight = sum((stop.weightKg for stop in self.stops), Decimal("0"))
        if total_weight > self.vehicleCapacityKg:
            raise ValueError("Total stop weight cannot exceed vehicleCapacityKg")
        return self


class RouteQueuedResponse(BaseModel):
    jobId: str
    status: str


class RouteStatusResponse(BaseModel):
    jobId: str
    status: RouteStatus
    orderedStops: list[dict]
    totalDistanceM: int
    estimatedDurationS: int
    error: str | None = None
    updatedAt: str | None = None
