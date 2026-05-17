from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DocumentType = Literal["invoice", "shipping_label", "pod", "manifest"]
DocumentStatus = Literal["QUEUED", "PROCESSING", "COMPLETED", "FAILED"]


class PdfDisplayOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    includeLogo: bool = True
    locale: str | None = Field(default=None, max_length=16)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    labelSize: Literal["100x150mm", "4x6in"] | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        return value.upper() if value else None


class PdfGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tenantId: str = Field(min_length=1)
    type: DocumentType
    shipmentId: str = Field(min_length=1)
    idempotencyKey: str | None = Field(default=None, min_length=8, max_length=200)
    options: PdfDisplayOptions = Field(default_factory=PdfDisplayOptions)
    data: dict[str, Any] = Field(default_factory=dict, exclude=True)


class PdfQueuedResponse(BaseModel):
    jobId: str
    status: DocumentStatus


class PdfStatusResponse(BaseModel):
    jobId: str
    status: DocumentStatus
    url: str | None = None
    error: str | None = None
