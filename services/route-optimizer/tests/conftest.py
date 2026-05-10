from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_stops():
    return [
        {"id": "stop1", "type": "PICKUP", "lat": 51.5074, "lng": -0.1278, "serviceMinutes": 5.0, "priority": "NORMAL"},
        {"id": "stop2", "type": "DROPOFF", "lat": 51.5155, "lng": -0.1426, "serviceMinutes": 5.0, "priority": "NORMAL"},
        {"id": "stop3", "type": "PICKUP", "lat": 51.5033, "lng": -0.1195, "serviceMinutes": 5.0, "priority": "HIGH"},
    ]


@pytest.fixture
def sample_vehicle():
    return {"start": {"lat": 51.5074, "lng": -0.1278}, "end": None, "capacity": None}


@pytest.fixture
def sample_optimize_request(sample_vehicle, sample_stops):
    return {
        "requestId": "test-request-123",
        "vehicle": sample_vehicle,
        "constraints": {"maxStops": None, "maxKm": None, "maxMinutes": None},
        "stops": sample_stops,
        "options": {"objective": "BALANCED", "seed": 42, "explain": True, "useEtaModel": False},
    }


@pytest.fixture
def sample_eta_training_data():
    base_time = datetime(2025, 1, 1, 9, 0, 0)
    rows = []
    for i in range(20):
        rows.append({
            "fromLat": 51.5074 + (i * 0.01),
            "fromLng": -0.1278 + (i * 0.01),
            "toLat": 51.5074 + (i * 0.01) + 0.02,
            "toLng": -0.1278 + (i * 0.01) + 0.02,
            "departedAt": base_time.isoformat(),
            "arrivedAt": base_time.replace(minute=15).isoformat(),
        })
    return {"rows": rows}
