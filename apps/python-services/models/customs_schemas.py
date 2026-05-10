from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DeclarationType = Literal["uk_cds", "eu_aes", "ioss"]
DeclarationStatus = Literal["QUEUED", "PROCESSING", "COMPLETED", "FAILED"]


class DutyEstimateRequest(BaseModel):
    originCountry: str = Field(min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")
    destCountry: str = Field(min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")
    hsCode: str = Field(min_length=2, max_length=12, pattern=r"^[0-9.]+$")
    declaredValue: Decimal = Field(gt=Decimal("0"), le=Decimal("1000000000"))
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")

    @field_validator("originCountry", "destCountry", "currency")
    @classmethod
    def uppercase_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("hsCode")
    @classmethod
    def normalize_hs_code(cls, value: str) -> str:
        return value.strip()


class DutyEstimateResponse(BaseModel):
    originCountry: str
    destCountry: str
    hsCode: str
    declaredValue: float
    dutyRate: float
    vatRate: float
    importDuty: float
    vat: float
    totalLandedCost: float
    currency: str
    estimateOnly: bool = True


class DeclarationOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    iossNumber: str | None = Field(default=None, max_length=32)
    language: str | None = Field(default=None, max_length=16)


class DeclarationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tenantId: str = Field(min_length=1)
    shipmentId: str = Field(min_length=1)
    declarationType: DeclarationType
    idempotencyKey: str | None = Field(default=None, min_length=8, max_length=200)
    options: DeclarationOptions = Field(default_factory=DeclarationOptions)
    shipmentData: dict[str, Any] = Field(default_factory=dict, exclude=True)


class DeclarationQueuedResponse(BaseModel):
    jobId: str
    status: DeclarationStatus


class DeclarationStatusResponse(BaseModel):
    jobId: str
    tenantId: str
    shipmentId: str | None
    declarationType: DeclarationType
    status: DeclarationStatus
    error: str | None = None
    updatedAt: str | None = None
