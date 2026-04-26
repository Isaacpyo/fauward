import csv
import difflib
import hashlib
import json
from pathlib import Path
from typing import Any

import redis

from config import settings

DATA_PATH = Path(__file__).parent / "data" / "hs_codes.csv"

_rows: list[dict[str, str]] | None = None


def _load_rows() -> list[dict[str, str]]:
    global _rows
    if _rows is not None:
        return _rows
    with DATA_PATH.open("r", encoding="utf-8", newline="") as handle:
        _rows = list(csv.DictReader(handle))
    return _rows


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def fuzzy_match(description: str, limit: int = 5) -> list[dict[str, Any]]:
    normalized = " ".join(description.lower().split())
    if not normalized:
        return []
    cache_key = f"hs:lookup:{hashlib.sha256(normalized.encode('utf-8')).hexdigest()}"
    try:
        cached = _redis_client().get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        cached = None

    rows = _load_rows()
    descriptions = [row["description"].lower() for row in rows]
    close = difflib.get_close_matches(normalized, descriptions, n=max(limit * 4, 10), cutoff=0.08)
    scored: list[tuple[float, dict[str, str]]] = []
    for row in rows:
        text = row["description"].lower()
        ratio = difflib.SequenceMatcher(a=normalized, b=text).ratio()
        token_bonus = sum(0.05 for token in normalized.split() if token in text)
        close_bonus = 0.1 if text in close else 0
        scored.append((ratio + token_bonus + close_bonus, row))
    results = [
        {
            "hsCode": row["hs_code"],
            "description": row["description"],
            "notes": row.get("notes") or "",
            "score": round(score, 4),
        }
        for score, row in sorted(scored, key=lambda item: item[0], reverse=True)[:limit]
    ]
    try:
        client = _redis_client()
        client.setex(cache_key, 86_400, json.dumps(results))
    except Exception:
        pass
    return results
