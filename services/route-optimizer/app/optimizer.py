import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.schemas import (
    Explanation,
    ExplanationScore,
    Leg,
    Objective,
    RouteResult,
    Stop,
    Violation,
    ViolationType,
)
from app.utils import calculate_leg_info, check_time_window_violation, haversine_distance


class RouteOptimizer:
    def __init__(
        self,
        vehicle_start: Tuple[float, float],
        vehicle_end: Optional[Tuple[float, float]],
        stops: List[Stop],
        objective: Objective,
        seed: int,
        constraints: Dict[str, Any],
        use_eta_model: bool = False,
        eta_predictor=None,
    ):
        self.vehicle_start = vehicle_start
        self.vehicle_end = vehicle_end if vehicle_end else vehicle_start
        self.stops = stops
        self.objective = objective
        self.seed = seed
        self.constraints = constraints
        self.use_eta_model = use_eta_model
        self.eta_predictor = eta_predictor
        random.seed(seed)
        self.stop_map = {s.id: s for s in stops}
        self.distance_matrix = self._build_distance_matrix()

    def _build_distance_matrix(self) -> Dict[Tuple[str, str], float]:
        matrix: Dict[Tuple[str, str], float] = {}
        for stop in self.stops:
            matrix[("start", stop.id)] = haversine_distance(self.vehicle_start[0], self.vehicle_start[1], stop.lat, stop.lng)
            matrix[(stop.id, "end")] = haversine_distance(stop.lat, stop.lng, self.vehicle_end[0], self.vehicle_end[1])
        for s1 in self.stops:
            for s2 in self.stops:
                if s1.id != s2.id:
                    matrix[(s1.id, s2.id)] = haversine_distance(s1.lat, s1.lng, s2.lat, s2.lng)
        return matrix

    def optimize(self, start_time: datetime) -> Tuple[RouteResult, Optional[Explanation]]:
        route_order = self._nearest_neighbor()
        route_order = self._two_opt(route_order)
        route_result = self._build_route_result(route_order, start_time)
        violations = self._check_constraints(route_result)
        route_result.violations = violations
        route_result.feasible = len(violations) == 0
        explanation = self._build_explanation(route_order, route_result)
        return route_result, explanation

    def _nearest_neighbor(self) -> List[str]:
        unvisited = set(s.id for s in self.stops)
        route: List[str] = []
        current_id = "start"
        while unvisited:
            nearest_id = min(unvisited, key=lambda sid: self.distance_matrix.get((current_id, sid), float("inf")))
            route.append(nearest_id)
            unvisited.remove(nearest_id)
            current_id = nearest_id
        return route

    def _two_opt(self, route: List[str]) -> List[str]:
        if len(route) < 3:
            return route
        best_route = route[:]
        best_cost = self._route_cost(best_route)
        improved = True
        iterations = 0
        max_iterations = min(100, len(route) * 10)
        while improved and iterations < max_iterations:
            improved = False
            iterations += 1
            for i in range(len(best_route) - 1):
                for j in range(i + 2, len(best_route)):
                    new_route = best_route[:]
                    new_route[i + 1: j + 1] = reversed(new_route[i + 1: j + 1])
                    new_cost = self._route_cost(new_route)
                    if new_cost < best_cost:
                        best_route = new_route
                        best_cost = new_cost
                        improved = True
        return best_route

    def _route_cost(self, route: List[str]) -> float:
        total_dist = 0.0
        if route:
            total_dist += self.distance_matrix.get(("start", route[0]), 0)
        for i in range(len(route) - 1):
            total_dist += self.distance_matrix.get((route[i], route[i + 1]), 0)
        if route:
            total_dist += self.distance_matrix.get((route[-1], "end"), 0)
        total_time = (total_dist / 35.0) * 60.0
        for sid in route:
            total_time += self.stop_map[sid].serviceMinutes
        if self.objective == Objective.MIN_DISTANCE:
            return total_dist
        if self.objective == Objective.MIN_TIME:
            return total_time
        return total_dist + (total_time / 2.0)

    def _build_route_result(self, route_order: List[str], start_time: datetime) -> RouteResult:
        legs: List[Leg] = []
        current_time = start_time
        current_lat, current_lng = self.vehicle_start
        current_id = "start"
        total_dist = 0.0
        total_dur = 0.0
        for stop_id in route_order:
            stop = self.stop_map[stop_id]
            dist_km, dur_min = calculate_leg_info(current_lat, current_lng, stop.lat, stop.lng, current_time, self.use_eta_model, self.eta_predictor)
            current_time += timedelta(minutes=dur_min)
            legs.append(Leg(fromId=current_id, toId=stop_id, distanceKm=round(dist_km, 2), durationMinutes=round(dur_min, 1), eta=current_time))
            total_dist += dist_km
            total_dur += dur_min
            current_time += timedelta(minutes=stop.serviceMinutes)
            total_dur += stop.serviceMinutes
            current_lat, current_lng = stop.lat, stop.lng
            current_id = stop_id
        dist_km, dur_min = calculate_leg_info(current_lat, current_lng, self.vehicle_end[0], self.vehicle_end[1], current_time, self.use_eta_model, self.eta_predictor)
        current_time += timedelta(minutes=dur_min)
        legs.append(Leg(fromId=current_id, toId="end", distanceKm=round(dist_km, 2), durationMinutes=round(dur_min, 1), eta=current_time))
        total_dist += dist_km
        total_dur += dur_min
        return RouteResult(orderedStopIds=route_order, legs=legs, totalDistanceKm=round(total_dist, 2), totalDurationMinutes=round(total_dur, 1), feasible=True, violations=[])

    def _check_constraints(self, route_result: RouteResult) -> List[Violation]:
        violations: List[Violation] = []
        if self.constraints.get("maxKm") is not None and route_result.totalDistanceKm > self.constraints["maxKm"]:
            violations.append(Violation(stopId="route", reason=ViolationType.MAX_KM, details=f"{route_result.totalDistanceKm:.1f} km exceeds {self.constraints['maxKm']} km"))
        if self.constraints.get("maxMinutes") is not None and route_result.totalDurationMinutes > self.constraints["maxMinutes"]:
            violations.append(Violation(stopId="route", reason=ViolationType.MAX_MINUTES, details=f"{route_result.totalDurationMinutes:.1f} min exceeds {self.constraints['maxMinutes']} min"))
        for leg in route_result.legs:
            if leg.toId == "end":
                continue
            stop = self.stop_map.get(leg.toId)
            if stop and stop.timeWindow and check_time_window_violation(leg.eta, stop.timeWindow):
                violations.append(Violation(stopId=stop.id, reason=ViolationType.TIME_WINDOW_MISSED, details=f"ETA {leg.eta.isoformat()} outside time window"))
        return violations

    def _build_explanation(self, route_order: List[str], route_result: RouteResult) -> Explanation:
        notes = [
            f"Optimized {len(route_order)} stops using nearest-neighbor + 2-opt",
            f"Objective: {self.objective.value}",
            f"Random seed: {self.seed} (deterministic)",
            "Used ML ETA model" if (self.use_eta_model and self.eta_predictor) else "Used baseline speed model (35 km/h)",
        ]
        if route_result.violations:
            notes.append(f"Found {len(route_result.violations)} constraint violations")
        return Explanation(
            algorithm="nearest-neighbor + 2-opt",
            notes=notes,
            score=ExplanationScore(distanceKm=route_result.totalDistanceKm, durationMinutes=route_result.totalDurationMinutes, violationPenalty=len(route_result.violations) * 1000.0),
        )
