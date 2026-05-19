from __future__ import annotations

from typing import Literal

InvoiceState = Literal["draft", "issued", "sent", "partially_paid", "paid", "void"]

TRANSITIONS: dict[InvoiceState, frozenset[InvoiceState]] = {
    "draft": frozenset({"issued"}),
    "issued": frozenset({"sent", "partially_paid", "paid", "void"}),
    "sent": frozenset({"partially_paid", "paid", "void"}),
    "partially_paid": frozenset({"paid"}),
    "paid": frozenset(),
    "void": frozenset(),
}


class InvalidTransition(ValueError):
    def __init__(self, current: str, target: str) -> None:
        super().__init__(f"Illegal invoice transition: {current} -> {target}")
        self.current = current
        self.target = target


def normalize_state(value: str) -> InvoiceState:
    normalized = value.strip().lower().replace("-", "_")
    if normalized == "partiallypaid":
        normalized = "partially_paid"
    if normalized not in TRANSITIONS:
        raise InvalidTransition(value, "unknown")
    return normalized  # type: ignore[return-value]


def db_state(value: str) -> str:
    return normalize_state(value).upper()


def domain_state(value: str) -> InvoiceState:
    return normalize_state(value)


def can_transition(current: str, target: str) -> bool:
    current_state = normalize_state(current)
    target_state = normalize_state(target)
    return target_state in TRANSITIONS[current_state]


def validate_transition(current: str, target: str) -> None:
    if not can_transition(current, target):
        raise InvalidTransition(normalize_state(current), normalize_state(target))


def require_draft(status: str) -> None:
    state = normalize_state(status)
    if state != "draft":
        raise InvalidTransition(state, "edit")


def state_for_payment(*, current: str, amount_paid_minor: int, total_minor: int) -> InvoiceState:
    state = normalize_state(current)
    if state not in {"issued", "sent", "partially_paid"}:
        raise InvalidTransition(state, "payment")
    if amount_paid_minor <= 0:
        raise ValueError("Payment amount must be positive")
    if amount_paid_minor >= total_minor:
        validate_transition(state, "paid")
        return "paid"
    if state == "partially_paid":
        return "partially_paid"
    validate_transition(state, "partially_paid")
    return "partially_paid"
