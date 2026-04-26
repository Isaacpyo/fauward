import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

DATA_PATH = Path(__file__).parent / "data" / "duty_rates.json"


def _money(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _load_rates() -> dict[str, Any]:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def estimate_landed_cost(
    *,
    origin_country: str,
    dest_country: str,
    hs_code: str,
    declared_value: float,
    currency: str,
) -> dict[str, Any]:
    rates = _load_rates()
    dest_key = dest_country.upper()
    country_rates = rates.get(dest_key, rates.get("DEFAULT", {}))
    prefix = hs_code.replace(".", "")[:2]
    duty_rate = Decimal(str(country_rates.get("duty_rates", {}).get(prefix, country_rates.get("default_duty_rate", 0))))
    vat_rate = Decimal(str(country_rates.get("vat_rate", 0)))
    value = Decimal(str(declared_value))
    import_duty = value * duty_rate
    vat = (value + import_duty) * vat_rate
    total = value + import_duty + vat
    return {
        "originCountry": origin_country.upper(),
        "destCountry": dest_key,
        "hsCode": hs_code,
        "declaredValue": _money(value),
        "dutyRate": float(duty_rate),
        "vatRate": float(vat_rate),
        "importDuty": _money(import_duty),
        "vat": _money(vat),
        "totalLandedCost": _money(total),
        "currency": currency.upper(),
    }
