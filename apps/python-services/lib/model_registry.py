import io
import logging
from datetime import UTC, datetime
from typing import Any

import joblib

from lib.storage import download_bytes, list_paths, upload_bytes

logger = logging.getLogger(__name__)


class ModelRegistry:
    def __init__(self) -> None:
        self._cache: dict[str, Any] = {}

    def load_latest(self, model_name: str) -> Any | None:
        if model_name in self._cache:
            return self._cache[model_name]
        prefix = f"models/{model_name}"
        candidates = [path for path in list_paths(bucket="models", prefix=prefix) if path.endswith(".pkl")]
        if not candidates:
            return None
        latest = sorted(candidates)[-1]
        content = download_bytes(bucket="models", path=latest)
        if not content:
            return None
        artifact = joblib.load(io.BytesIO(content))
        self._cache[model_name] = artifact
        logger.info("model_loaded", extra={"_model_name": model_name, "_path": latest})
        return artifact

    def save(self, model_name: str, artifact: Any) -> str:
        buffer = io.BytesIO()
        joblib.dump(artifact, buffer)
        timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        path = f"models/{model_name}/v{timestamp}.pkl"
        url = upload_bytes(bucket="models", path=path, content=buffer.getvalue(), content_type="application/octet-stream")
        self._cache[model_name] = artifact
        logger.info("model_saved", extra={"_model_name": model_name, "_path": path})
        return url

    def set_cached(self, model_name: str, artifact: Any) -> None:
        self._cache[model_name] = artifact


model_registry = ModelRegistry()
