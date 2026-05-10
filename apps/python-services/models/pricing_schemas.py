from decimal import Decimal
import re

from pydantic import BaseModel, Field, field_validator

POSTCODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9 -]{1,15}[A-Z0-9]$")
PROMO_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]{0,39}$")


class PricingQuoteRequest(BaseModel):
    tenantId: str = Field(min_length=1)
    originPostcode: str = Field(min_length=2, max_length=16)
    destPostcode: str = Field(min_length=2, max_length=16)
    weightKg: Decimal = Field(gt=Decimal("0"), le=Decimal("1000"))
    promoCode: str | None = Field(default=None, max_length=40)

    @field_validator("originPostcode", "destPostcode")
    @classmethod
    def normalize_postcode(cls, value: str) -> str:
        normalized = " ".join(value.strip().upper().split())
        if not POSTCODE_PATTERN.fullmatch(normalized):
            raise ValueError("Invalid postcode")
        return normalized

    @field_validator("promoCode")
    @classmethod
    def normalize_promo_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not normalized:
            return None
        if not PROMO_PATTERN.fullmatch(normalized):
            raise ValueError("Invalid promo code")
        return normalized


class PricingQuoteBreakdown(BaseModel):
    base: float
    surcharges: list[dict[str, float | str]]
    promoDiscount: float


class PricingQuoteResponse(BaseModel):
    quoteId: str
    tenantId: str
    currency: str
    subtotal: float
    discount: float
    total: float
    validUntil: str
    breakdown: PricingQuoteBreakdown
