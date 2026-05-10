import math
from datetime import datetime
from typing import Tuple

EARTH_RADIUS_KM = 6371.0
BASE_SPEED_KMH = 35.0


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    lat1_r, lng1_r, lat2_r, lng2_r = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2_r - lat1_r
    dlng = lng2_r - lng1_r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def baseline_duration_minutes(distance_km: float, departed_at: datetime) -> float:
    base = (distance_km / BASE_SPEED_KMH) * 60.0
    hour = departed_at.hour
    if (7 <= hour < 9) or (17 <= hour < 19):
        return base * 1.3
    if (23 <= hour) or (hour < 5):
        return base * 0.85
    if 12 <= hour < 14:
        return base * 1.1
    return base


def extract_time_features(dt: datetime) -> Tuple[float, float, int]:
    hour = dt.hour + dt.minute / 60.0
    hour_sin = math.sin(2 * math.pi * hour / 24.0)
    hour_cos = math.cos(2 * math.pi * hour / 24.0)
    return hour_sin, hour_cos, dt.weekday()


def calculate_leg_info(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    departed_at: datetime,
    use_ml_model: bool = False,
    ml_predictor=None,
) -> Tuple[float, float]:
    distance_km = haversine_distance(from_lat, from_lng, to_lat, to_lng)
    if use_ml_model and ml_predictor is not None:
        try:
            duration_minutes = ml_predictor.predict(
                distance_km, from_lat, from_lng, to_lat, to_lng, departed_at
            )
        except Exception:
            duration_minutes = baseline_duration_minutes(distance_km, departed_at)
    else:
        duration_minutes = baseline_duration_minutes(distance_km, departed_at)
    return distance_km, duration_minutes


def check_time_window_violation(eta: datetime, time_window) -> bool:
    if time_window is None:
        return False
    if time_window.start and eta < time_window.start:
        return True
    if time_window.end and eta > time_window.end:
        return True
    return False
