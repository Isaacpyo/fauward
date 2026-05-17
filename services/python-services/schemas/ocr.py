from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DocumentType = Literal["return_auth", "customs_form", "bill_of_lading", "pod_photo"]
OcrStatus = Literal["QUEUED", "PROCESSING", "READY", "COMPLETED", "FAILED"]


class OcrJsonRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tenantId: str = Field(min_length=1, max_length=128)
    documentType: DocumentType
    fileUrl: str = Field(min_length=1, max_length=2048)
    idempotencyKey: str | None = Field(default=None, min_length=8, max_length=200)

    @field_validator("tenantId", "fileUrl", "idempotencyKey")
    @classmethod
    def trim_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("value is required")
        return normalized


class OcrQueuedResponse(BaseModel):
    jobId: str
    status: str


class OcrResultResponse(BaseModel):
    jobId: str
    status: OcrStatus
    documentType: DocumentType | str
    extractedFields: dict
    confidenceScore: float
    error: str | None = None
