import logging
from typing import Any

from lib.json_logging import configure_logging


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def safe_extra(**values: Any) -> dict[str, Any]:
    return {f"_{key}": value for key, value in values.items() if value is not None}


__all__ = ["configure_logging", "get_logger", "safe_extra"]
