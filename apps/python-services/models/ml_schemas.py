from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PredictionListItem(BaseModel):
    entityType: str
    entityId: str
    modelName: str
    score: float
    label: str
    payload: dict[str, Any]
    updatedAt: datetime | None = None


class PredictionListResponse(BaseModel):
    predictions: list[PredictionListItem]


class LeadPredictionItem(BaseModel):
    leadId: str
    tenantId: str | None = None
    company: str | None = None
    email: str | None = None
    score: float
    label: str
    payload: dict[str, Any]


class LeadPredictionListResponse(BaseModel):
    leads: list[LeadPredictionItem]


class EtaPredictionResponse(BaseModel):
    shipmentId: str
    tenantId: str | None = None
    eta: str | None = None
    confidence: float
    riskLevel: str
    factors: list[str]
    updatedAt: datetime | None = None


class SlaRiskResponse(BaseModel):
    shipmentId: str
    tenantId: str | None = None
    score: float
    label: str
    likelyToBreach: bool
    factors: list[str]
    recommendedAction: str
    updatedAt: datetime | None = None


class CustomsRiskResponse(BaseModel):
    shipmentId: str
    tenantId: str | None = None
    score: float
    label: str
    likelyCustomsDelay: bool
    factors: list[str]
    updatedAt: datetime | None = None


class RouteRiskResponse(BaseModel):
    routeId: str
    origin: str | None = None
    destination: str | None = None
    score: float
    label: str
    mainRisks: list[str]
    updatedAt: datetime | None = None


class AnomalyResponse(BaseModel):
    shipmentId: str
    tenantId: str | None = None
    score: float
    label: str
    isAnomaly: bool
    signals: list[str]
    updatedAt: datetime | None = None


class DemandForecastResponse(BaseModel):
    tenantId: str
    next7Days: int
    next30Days: int
    trend: str
    confidence: float
    updatedAt: datetime | None = None


class PricingRecommendationRequest(BaseModel):
    tenantId: str
    origin: str
    destination: str
    weightKg: float = Field(gt=0)
    volumeCm3: float = Field(ge=0)
    serviceLevel: str
    customerType: str
    declaredValue: float = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)


class PricingRecommendationResponse(BaseModel):
    tenantId: str
    recommendedPrice: float
    floorPrice: float
    ceilingPrice: float
    currency: str
    marginEstimate: float
    confidence: float
    reason: str
    warnings: list[str]


class CustomerLtvResponse(BaseModel):
    customerId: str
    tenantId: str | None = None
    predictedLtv: float
    currency: str
    segment: str
    confidence: float
    factors: list[str]
    updatedAt: datetime | None = None


class TicketClassificationRequest(BaseModel):
    tenantId: str
    subject: str = Field(min_length=1)
    message: str = Field(min_length=1)
    shipmentId: str | None = None


class TicketClassificationResponse(BaseModel):
    tenantId: str
    category: str
    priority: str
    confidence: float
    suggestedQueue: str
    suggestedTags: list[str]


class NextBestActionResponse(BaseModel):
    shipmentId: str
    tenantId: str | None = None
    recommendedAction: str
    priority: str
    reason: str
    confidence: float
    sourceSignals: list[str]
    updatedAt: datetime | None = None


class FeedbackRequest(BaseModel):
    tenantId: str
    entityType: str
    entityId: str
    modelName: str
    predictionWasCorrect: bool
    actualLabel: str | None = None
    actualValue: Any = None
    notes: str | None = None


class FeedbackResponse(BaseModel):
    status: str


class ModelStatusItem(BaseModel):
    name: str
    status: str
    version: str | None = None
    lastTrainedAt: datetime | None = None
    metrics: dict[str, Any]


class ModelStatusResponse(BaseModel):
    models: list[ModelStatusItem]


class RetrainResponse(BaseModel):
    modelName: str
    status: str
    taskId: str


class RetrainStatusResponse(BaseModel):
    taskId: str
    status: str
    result: dict[str, Any] | None = None
