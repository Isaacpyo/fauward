from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

InvoiceStatus = Literal["draft", "issued", "sent", "partially_paid", "paid", "void"]


class Money(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amountMinor: int = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.strip().upper()


class Address(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=200)
    line1: str = Field(min_length=1, max_length=200)
    line2: str | None = Field(default=None, max_length=200)
    city: str = Field(min_length=1, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    postalCode: str | None = Field(default=None, max_length=40)
    countryCode: str = Field(min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")

    @field_validator("countryCode")
    @classmethod
    def uppercase_country(cls, value: str) -> str:
        return value.strip().upper()


class TaxBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    taxCode: str = Field(min_length=1, max_length=64)
    taxableAmount: Money
    taxAmount: Money
    rateBps: int = Field(ge=0, le=10000)
    countryCode: str | None = Field(default=None, min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")
    reverseCharge: bool = False

    @field_validator("countryCode")
    @classmethod
    def uppercase_country(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else None

    @model_validator(mode="after")
    def validate_currency_match(self) -> "TaxBreakdown":
        if self.taxableAmount.currency != self.taxAmount.currency:
            raise ValueError("Tax amounts must use one currency")
        return self


class LineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = None
    lineNumber: int = Field(ge=1)
    description: str = Field(min_length=1, max_length=1000)
    quantityMicros: int = Field(default=1_000_000, gt=0)
    unitAmount: Money
    discountAmount: Money = Field(default_factory=lambda: Money(amountMinor=0, currency="GBP"))
    netAmount: Money
    taxAmount: Money
    grossAmount: Money
    taxCode: str = Field(min_length=1, max_length=64)
    taxRateBps: int = Field(ge=0, le=10000)
    taxCountryCode: str | None = Field(default=None, min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")
    reverseCharge: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("taxCountryCode")
    @classmethod
    def uppercase_country(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else None

    @model_validator(mode="after")
    def validate_money(self) -> "LineItem":
        if self.discountAmount.amountMinor == 0 and self.discountAmount.currency != self.unitAmount.currency:
            self.discountAmount = Money(amountMinor=0, currency=self.unitAmount.currency)
        currencies = {
            self.unitAmount.currency,
            self.discountAmount.currency,
            self.netAmount.currency,
            self.taxAmount.currency,
            self.grossAmount.currency,
        }
        if len(currencies) != 1:
            raise ValueError("Line item amounts must use one currency")
        if self.grossAmount.amountMinor != self.netAmount.amountMinor + self.taxAmount.amountMinor:
            raise ValueError("grossAmount must equal netAmount plus taxAmount")
        return self


class Invoice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tenantId: str
    invoiceNumber: str | None = None
    fiscalYear: int | None = None
    sequenceNumber: int | None = None
    status: InvoiceStatus = "draft"
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")
    lineItems: list[LineItem] = Field(default_factory=list)
    taxBreakdown: list[TaxBreakdown] = Field(default_factory=list)
    subtotal: Money
    discount: Money = Field(default_factory=lambda: Money(amountMinor=0, currency="GBP"))
    taxTotal: Money
    total: Money
    amountPaid: Money = Field(default_factory=lambda: Money(amountMinor=0, currency="GBP"))
    amountDue: Money
    payerName: str = Field(min_length=1, max_length=200)
    payerAddress: Address
    payerVatId: str | None = Field(default=None, max_length=64)
    payeeName: str = Field(min_length=1, max_length=200)
    payeeAddress: Address
    payeeVatId: str | None = Field(default=None, max_length=64)
    reverseCharge: bool = False
    issueDate: date | None = None
    issuedAt: datetime | None = None
    dueDate: datetime | None = None
    contentHashSha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.strip().upper()

    @model_validator(mode="after")
    def validate_totals(self) -> "Invoice":
        if self.discount.amountMinor == 0 and self.discount.currency != self.currency:
            self.discount = Money(amountMinor=0, currency=self.currency)
        if self.amountPaid.amountMinor == 0 and self.amountPaid.currency != self.currency:
            self.amountPaid = Money(amountMinor=0, currency=self.currency)
        amounts = [self.subtotal, self.discount, self.taxTotal, self.total, self.amountPaid, self.amountDue]
        if any(amount.currency != self.currency for amount in amounts):
            raise ValueError("Invoice amounts must use invoice currency")
        for line in self.lineItems:
            if line.grossAmount.currency != self.currency:
                raise ValueError("Line item currency must match invoice currency")
        for tax in self.taxBreakdown:
            if tax.taxAmount.currency != self.currency:
                raise ValueError("Tax breakdown currency must match invoice currency")
        if self.total.amountMinor != self.subtotal.amountMinor - self.discount.amountMinor + self.taxTotal.amountMinor:
            raise ValueError("total must equal subtotal minus discount plus taxTotal")
        if self.amountDue.amountMinor != self.total.amountMinor - self.amountPaid.amountMinor:
            raise ValueError("amountDue must equal total minus amountPaid")
        return self
