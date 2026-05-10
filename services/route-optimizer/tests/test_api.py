from fastapi import status


class TestHealthEndpoint:
    def test_health_check(self, client):
        response = client.get("/v1/health")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["ok"] is True
        assert "version" in data
        assert "etaModelLoaded" in data


class TestOptimizeEndpoint:
    def test_optimize_success(self, client, sample_optimize_request):
        response = client.post("/v1/optimize", json=sample_optimize_request)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["requestId"] == "test-request-123"
        route = data["route"]
        assert len(route["orderedStopIds"]) == 3
        assert set(route["orderedStopIds"]) == {"stop1", "stop2", "stop3"}
        assert route["totalDistanceKm"] > 0
        assert route["totalDurationMinutes"] > 0
        assert data["explain"] is not None

    def test_optimize_without_explanation(self, client, sample_optimize_request):
        sample_optimize_request["options"]["explain"] = False
        response = client.post("/v1/optimize", json=sample_optimize_request)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["explain"] is None

    def test_optimize_deterministic(self, client, sample_optimize_request):
        r1 = client.post("/v1/optimize", json=sample_optimize_request).json()
        r2 = client.post("/v1/optimize", json=sample_optimize_request).json()
        assert r1["route"]["orderedStopIds"] == r2["route"]["orderedStopIds"]

    def test_optimize_no_stops(self, client, sample_optimize_request):
        sample_optimize_request["stops"] = []
        response = client.post("/v1/optimize", json=sample_optimize_request)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_optimize_duplicate_stop_ids(self, client, sample_optimize_request):
        sample_optimize_request["stops"][1]["id"] = "stop1"
        response = client.post("/v1/optimize", json=sample_optimize_request)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_optimize_invalid_coordinates(self, client, sample_optimize_request):
        sample_optimize_request["stops"][0]["lat"] = 91.0
        response = client.post("/v1/optimize", json=sample_optimize_request)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_optimize_single_stop(self, client, sample_vehicle):
        request_data = {
            "requestId": "single-stop",
            "vehicle": sample_vehicle,
            "constraints": {},
            "stops": [{"id": "only", "type": "PICKUP", "lat": 51.5155, "lng": -0.1426, "serviceMinutes": 5.0, "priority": "NORMAL"}],
            "options": {"objective": "BALANCED", "seed": 42, "explain": False},
        }
        response = client.post("/v1/optimize", json=request_data)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()["route"]["orderedStopIds"]) == 1

    def test_optimize_with_vehicle_end(self, client, sample_optimize_request):
        sample_optimize_request["vehicle"]["end"] = {"lat": 51.5200, "lng": -0.1300}
        response = client.post("/v1/optimize", json=sample_optimize_request)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["route"]["legs"][-1]["to"] == "end"

    def test_optimize_max_km_constraint(self, client, sample_optimize_request):
        sample_optimize_request["constraints"]["maxKm"] = 1.0
        response = client.post("/v1/optimize", json=sample_optimize_request)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["route"]["feasible"] is False
        assert len(data["route"]["violations"]) > 0

    def test_optimize_min_time_objective(self, client, sample_optimize_request):
        sample_optimize_request["options"]["objective"] = "MIN_TIME"
        response = client.post("/v1/optimize", json=sample_optimize_request)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()["route"]["orderedStopIds"]) == 3

    def test_optimize_min_distance_objective(self, client, sample_optimize_request):
        sample_optimize_request["options"]["objective"] = "MIN_DISTANCE"
        response = client.post("/v1/optimize", json=sample_optimize_request)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()["route"]["orderedStopIds"]) == 3


class TestEtaTrainEndpoint:
    def test_train_success(self, client, sample_eta_training_data):
        response = client.post("/v1/eta/train", json=sample_eta_training_data)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["trained"] is True
        assert data["rowsUsed"] > 0

    def test_train_insufficient_data(self, client):
        data = {"rows": [{"fromLat": 51.5074, "fromLng": -0.1278, "toLat": 51.5155, "toLng": -0.1426, "departedAt": "2025-01-01T09:00:00", "arrivedAt": "2025-01-01T09:15:00"}]}
        response = client.post("/v1/eta/train", json=data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_train_invalid_times(self, client):
        data = {"rows": [{"fromLat": 51.5074, "fromLng": -0.1278, "toLat": 51.5155, "toLng": -0.1426, "departedAt": "2025-01-01T09:00:00", "arrivedAt": "2025-01-01T08:00:00"}]}
        response = client.post("/v1/eta/train", json=data)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestRootEndpoint:
    def test_root(self, client):
        response = client.get("/")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "service" in data
        assert "version" in data
