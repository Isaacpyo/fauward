from datetime import datetime
from pathlib import Path
from typing import List, Optional

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler

from app.utils import extract_time_features, haversine_distance

MODEL_PATH = Path(__file__).parent.parent / "data" / "model.joblib"
SCALER_PATH = Path(__file__).parent.parent / "data" / "scaler.joblib"


class EtaPredictor:
    def __init__(self):
        self.model: Optional[RandomForestRegressor] = None
        self.scaler: Optional[StandardScaler] = None
        self.is_trained = False
        self._load_model()

    def _load_model(self) -> bool:
        try:
            if MODEL_PATH.exists() and SCALER_PATH.exists():
                self.model = joblib.load(MODEL_PATH)
                self.scaler = joblib.load(SCALER_PATH)
                self.is_trained = True
                return True
        except Exception:
            pass
        return False

    def _save_model(self) -> bool:
        try:
            MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
            joblib.dump(self.model, MODEL_PATH)
            joblib.dump(self.scaler, SCALER_PATH)
            return True
        except Exception:
            return False

    def _extract_features(
        self,
        distance_km: float,
        from_lat: float,
        from_lng: float,
        to_lat: float,
        to_lng: float,
        departed_at: datetime,
    ) -> np.ndarray:
        hour_sin, hour_cos, day_of_week = extract_time_features(departed_at)
        dow_encoded = [0] * 7
        dow_encoded[day_of_week] = 1
        features = [distance_km, hour_sin, hour_cos, from_lat, from_lng, to_lat, to_lng] + dow_encoded
        return np.array(features).reshape(1, -1)

    def train(
        self,
        from_lats: List[float],
        from_lngs: List[float],
        to_lats: List[float],
        to_lngs: List[float],
        departed_ats: List[datetime],
        arrived_ats: List[datetime],
    ) -> int:
        n = len(from_lats)
        if not all(len(lst) == n for lst in [from_lngs, to_lats, to_lngs, departed_ats, arrived_ats]):
            raise ValueError("All input lists must have the same length")
        if n < 10:
            raise ValueError("Need at least 10 training samples")

        X_list, y_list = [], []
        for i in range(n):
            distance_km = haversine_distance(from_lats[i], from_lngs[i], to_lats[i], to_lngs[i])
            duration_minutes = (arrived_ats[i] - departed_ats[i]).total_seconds() / 60.0
            if duration_minutes <= 0 or duration_minutes > 1440 or distance_km < 0.1:
                continue
            X_list.append(self._extract_features(distance_km, from_lats[i], from_lngs[i], to_lats[i], to_lngs[i], departed_ats[i]).flatten())
            y_list.append(duration_minutes)

        if len(X_list) < 10:
            raise ValueError(f"After filtering, only {len(X_list)} valid samples remain (need at least 10)")

        X = np.array(X_list)
        y = np.array(y_list)
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        self.model = RandomForestRegressor(n_estimators=50, max_depth=10, min_samples_split=5, min_samples_leaf=2, random_state=42, n_jobs=-1)
        self.model.fit(X_scaled, y)
        self.is_trained = True
        self._save_model()
        return len(X_list)

    def predict(self, distance_km: float, from_lat: float, from_lng: float, to_lat: float, to_lng: float, departed_at: datetime) -> float:
        if not self.is_trained or self.model is None or self.scaler is None:
            raise RuntimeError("Model is not trained")
        features = self._extract_features(distance_km, from_lat, from_lng, to_lat, to_lng, departed_at)
        features_scaled = self.scaler.transform(features)
        prediction = self.model.predict(features_scaled)[0]
        return float(max(0.5, min(prediction, 1440.0)))

    def is_loaded(self) -> bool:
        return self.is_trained and self.model is not None


_eta_predictor_instance: Optional[EtaPredictor] = None


def get_eta_predictor() -> EtaPredictor:
    global _eta_predictor_instance
    if _eta_predictor_instance is None:
        _eta_predictor_instance = EtaPredictor()
    return _eta_predictor_instance
