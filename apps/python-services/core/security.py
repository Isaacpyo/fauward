import hashlib
import re
from collections.abc import Iterable
from typing import Any

SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")


def stable_secret_digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_scopes(scopes: Any) -> tuple[str, ...]:
    if scopes is None:
        return ()
    if isinstance(scopes, str):
        raw_parts = scopes.replace(",", " ").split()
    elif isinstance(scopes, Iterable):
        raw_parts = []
        for scope in scopes:
            if scope is not None:
                raw_parts.extend(str(scope).replace(",", " ").split())
    else:
        raw_parts = str(scopes).replace(",", " ").split()

    normalized: list[str] = []
    seen: set[str] = set()
    for scope in raw_parts:
        value = scope.strip().casefold()
        if value and value not in seen:
            seen.add(value)
            normalized.append(value)
    return tuple(normalized)


def is_safe_identifier(value: str) -> bool:
    return bool(SAFE_ID_PATTERN.fullmatch(value.strip()))
