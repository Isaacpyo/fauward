from datetime import datetime

import pytest

from app.optimizer import RouteOptimizer
from app.schemas import Objective, Priority, Stop, StopType


@pytest.fixture
def simple_stops():
    return [
        Stop(id="A", type=StopType.PICKUP, lat=51.5074, lng=-0.1278, serviceMinutes=5.0, priority=Priority.NORMAL),
        Stop(id="B", type=StopType.DROPOFF, lat=51.5155, lng=-0.1426, serviceMinutes=5.0, priority=Priority.NORMAL),
        Stop(id="C", type=StopType.PICKUP, lat=51.5033, lng=-0.1195, serviceMinutes=5.0, priority=Priority.HIGH),
    ]


def make_optimizer(stops, objective=Objective.BALANCED, seed=42, constraints=None):
    return RouteOptimizer(
        vehicle_start=(51.5074, -0.1278),
        vehicle_end=None,
        stops=stops,
        objective=objective,
        seed=seed,
        constraints=constraints or {},
        use_eta_model=False,
    )


class TestRouteOptimizer:
    def test_initialization(self, simple_stops):
        opt = make_optimizer(simple_stops)
        assert opt.vehicle_start == (51.5074, -0.1278)
        assert opt.vehicle_end == (51.5074, -0.1278)
        assert len(opt.stops) == 3
        assert len(opt.distance_matrix) > 0

    def test_returns_valid_route(self, simple_stops):
        opt = make_optimizer(simple_stops)
        result, explanation = opt.optimize(datetime(2025, 1, 1, 9, 0))
        assert len(result.orderedStopIds) == 3
        assert set(result.orderedStopIds) == {"A", "B", "C"}
        assert result.totalDistanceKm > 0
        assert result.totalDurationMinutes > 0
        assert len(result.legs) == 4  # start → 3 stops → end

    def test_deterministic_with_seed(self, simple_stops):
        t = datetime(2025, 1, 1, 9, 0)
        r1, _ = make_optimizer(simple_stops, seed=42).optimize(t)
        r2, _ = make_optimizer(simple_stops, seed=42).optimize(t)
        assert r1.orderedStopIds == r2.orderedStopIds
        assert r1.totalDistanceKm == r2.totalDistanceKm

    def test_constraint_maxkm_violation(self, simple_stops):
        opt = make_optimizer(simple_stops, constraints={"maxKm": 1.0})
        result, _ = opt.optimize(datetime(2025, 1, 1, 9, 0))
        assert not result.feasible
        assert any(v.reason.value == "MAX_KM" for v in result.violations)

    def test_constraint_maxminutes_violation(self, simple_stops):
        opt = make_optimizer(simple_stops, constraints={"maxMinutes": 5.0})
        result, _ = opt.optimize(datetime(2025, 1, 1, 9, 0))
        assert not result.feasible
        assert any(v.reason.value == "MAX_MINUTES" for v in result.violations)

    def test_explanation_generation(self, simple_stops):
        opt = make_optimizer(simple_stops, objective=Objective.MIN_DISTANCE)
        _, explanation = opt.optimize(datetime(2025, 1, 1, 9, 0))
        assert explanation is not None
        assert explanation.algorithm == "nearest-neighbor + 2-opt"
        assert explanation.score.distanceKm > 0

    def test_single_stop(self):
        stops = [Stop(id="only", type=StopType.PICKUP, lat=51.5155, lng=-0.1426, serviceMinutes=5.0, priority=Priority.NORMAL)]
        result, _ = make_optimizer(stops).optimize(datetime(2025, 1, 1, 9, 0))
        assert result.orderedStopIds == ["only"]
        assert len(result.legs) == 2  # start → only → end

    def test_min_time_objective(self, simple_stops):
        result, _ = make_optimizer(simple_stops, objective=Objective.MIN_TIME).optimize(datetime(2025, 1, 1, 9, 0))
        assert len(result.orderedStopIds) == 3

    def test_min_distance_objective(self, simple_stops):
        result, _ = make_optimizer(simple_stops, objective=Objective.MIN_DISTANCE).optimize(datetime(2025, 1, 1, 9, 0))
        assert len(result.orderedStopIds) == 3
