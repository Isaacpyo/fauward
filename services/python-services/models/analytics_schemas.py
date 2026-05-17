from typing import Any

from pydantic import BaseModel, Field


class AnalyticsDailyPoint(BaseModel):
    date: str
    shipments: int
    revenue: float


class AnalyticsSummaryResponse(BaseModel):
    shipmentsTotal: int
    onTimeRate: float
    revenueTotal: float
    avgDeliveryHours: float
    dailySeries: list[AnalyticsDailyPoint]


class CohortPoint(BaseModel):
    signupWeek: str
    metrics: dict[str, Any] = Field(default_factory=dict)


class CohortResponse(BaseModel):
    tenantId: str
    cohorts: list[CohortPoint]


class LiveKpiPayload(BaseModel):
    shipmentsToday: int = 0
    revenueToday: float = 0.0


class ChurnRiskTenant(BaseModel):
    id: str
    name: str | None = None
    slug: str | None = None
    churnRisk: str


class ChurnRiskResponse(BaseModel):
    tenants: list[ChurnRiskTenant]
