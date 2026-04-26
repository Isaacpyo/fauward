import math
from datetime import datetime, time, timedelta
from typing import Any

import requests

import db
from celery_app import celery_app
from config import settings
from workers import run_worker


def _seconds_from_hhmm(value: str | None, fallback: int) -> int:
    if not value:
        return fallback
    parsed = datetime.strptime(value, "%H:%M").time()
    return parsed.hour * 3600 + parsed.minute * 60


def _matrix_from_osrm(depot: dict[str, float], stops: list[dict[str, Any]]) -> tuple[list[list[int]], list[list[int]]]:
    points = [depot, *stops]
    coords = ";".join(f"{point['lng']},{point['lat']}" for point in points)
    url = f"{settings.osrm_base_url.rstrip('/')}/table/v1/driving/{coords}"
    response = requests.get(url, params={"annotations": "duration,distance"}, timeout=30)
    response.raise_for_status()
    payload = response.json()
    durations = [[int(value or 0) for value in row] for row in payload.get("durations", [])]
    distances = [[int(value or 0) for value in row] for row in payload.get("distances", [])]
    if len(durations) != len(points) or len(distances) != len(points):
        raise ValueError("OSRM response matrix size did not match route stops")
    return durations, distances


def _haversine_m(a: dict[str, float], b: dict[str, float]) -> int:
    radius = 6_371_000
    lat1 = math.radians(float(a["lat"]))
    lat2 = math.radians(float(b["lat"]))
    dlat = math.radians(float(b["lat"]) - float(a["lat"]))
    dlng = math.radians(float(b["lng"]) - float(a["lng"]))
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return int(2 * radius * math.asin(math.sqrt(h)))


def _fallback_matrices(depot: dict[str, float], stops: list[dict[str, Any]]) -> tuple[list[list[int]], list[list[int]]]:
    points = [depot, *stops]
    distances = [[_haversine_m(a, b) for b in points] for a in points]
    durations = [[int(distance / 11.1) for distance in row] for row in distances]
    return durations, distances


def _solve_route(
    *,
    depot: dict[str, float],
    stops: list[dict[str, Any]],
    vehicle_capacity_kg: float,
    durations: list[list[int]],
    distances: list[list[int]],
) -> dict[str, Any]:
    try:
        from ortools.constraint_solver import pywrapcp, routing_enums_pb2

        node_count = len(stops) + 1
        manager = pywrapcp.RoutingIndexManager(node_count, 1, 0)
        routing = pywrapcp.RoutingModel(manager)

        def transit_callback(from_index: int, to_index: int) -> int:
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return durations[from_node][to_node]

        transit_index = routing.RegisterTransitCallback(transit_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_index)

        weights = [0, *[int(round(float(stop.get("weightKg") or 0) * 1000)) for stop in stops]]

        def demand_callback(from_index: int) -> int:
            return weights[manager.IndexToNode(from_index)]

        demand_index = routing.RegisterUnaryTransitCallback(demand_callback)
        routing.AddDimensionWithVehicleCapacity(
            demand_index,
            0,
            [int(round(vehicle_capacity_kg * 1000))],
            True,
            "Capacity",
        )

        routing.AddDimension(transit_index, 1800, 24 * 3600, False, "Time")
        time_dimension = routing.GetDimensionOrDie("Time")
        time_dimension.CumulVar(manager.NodeToIndex(0)).SetRange(0, 24 * 3600)
        for idx, stop in enumerate(stops, start=1):
            start = _seconds_from_hhmm(stop.get("timeWindowStart"), 0)
            end = _seconds_from_hhmm(stop.get("timeWindowEnd"), 24 * 3600)
            time_dimension.CumulVar(manager.NodeToIndex(idx)).SetRange(start, end)

        params = pywrapcp.DefaultRoutingSearchParameters()
        params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        params.time_limit.FromSeconds(10)
        solution = routing.SolveWithParameters(params)
        if solution is None:
            raise ValueError("OR-Tools could not find a feasible route")

        sequence: list[int] = []
        index = routing.Start(0)
        cumulative_seconds = 0
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != 0:
                sequence.append(node - 1)
            next_index = solution.Value(routing.NextVar(index))
            cumulative_seconds += durations[node][manager.IndexToNode(next_index)]
            index = next_index
    except Exception:
        unvisited = set(range(len(stops)))
        current = 0
        sequence = []
        while unvisited:
            nearest = min(unvisited, key=lambda stop_idx: durations[current][stop_idx + 1])
            sequence.append(nearest)
            current = nearest + 1
            unvisited.remove(nearest)

    ordered: list[dict[str, Any]] = []
    current_node = 0
    elapsed = 0
    total_distance = 0
    for order, stop_index in enumerate(sequence, start=1):
        node = stop_index + 1
        elapsed += durations[current_node][node]
        total_distance += distances[current_node][node]
        stop = stops[stop_index]
        ordered.append(
            {
                "order": order,
                "shipmentId": stop.get("shipmentId"),
                "lat": stop.get("lat"),
                "lng": stop.get("lng"),
                "etaSecondsFromStart": elapsed,
                "etaOffset": str(timedelta(seconds=elapsed)),
            }
        )
        current_node = node
    if sequence:
        total_distance += distances[current_node][0]
        elapsed += durations[current_node][0]
    return {
        "orderedStops": ordered,
        "totalDistanceM": total_distance,
        "estimatedDurationS": elapsed,
    }


async def handle_route_job(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload["jobId"])
    tenant_id = str(payload["tenantId"])
    depot = dict(payload["depot"])
    stops = list(payload.get("stops") or [])
    vehicle_capacity_kg = float(payload.get("vehicleCapacityKg") or 0)
    if not stops:
        raise ValueError("At least one stop is required")
    try:
        durations, distances = _matrix_from_osrm(depot, stops)
    except Exception:
        durations, distances = _fallback_matrices(depot, stops)
    result = _solve_route(
        depot=depot,
        stops=stops,
        vehicle_capacity_kg=vehicle_capacity_kg,
        durations=durations,
        distances=distances,
    )
    await db.execute(
        """
        insert into route_jobs (id, tenant_id, vehicle_id, ordered_stops, total_distance_m, estimated_duration_s, status, result, updated_at)
        values ($1, $2, $3, $4::jsonb, $5, $6, 'OPTIMISED', $7::jsonb, now())
        on conflict (id) do update
        set ordered_stops = excluded.ordered_stops,
            total_distance_m = excluded.total_distance_m,
            estimated_duration_s = excluded.estimated_duration_s,
            status = 'OPTIMISED',
            result = excluded.result,
            error_message = null,
            updated_at = now()
        """,
        job_id,
        tenant_id,
        payload.get("vehicleId"),
        db.json_dumps(result["orderedStops"]),
        result["totalDistanceM"],
        result["estimatedDurationS"],
        db.json_dumps(result),
    )
    return result


@celery_app.task(name="workers.route_worker.process_route_job", queue="routes")
def process_route_job(payload: dict[str, Any]) -> dict[str, Any]:
    return run_worker(
        worker_name="route_worker",
        done_queue="fauward:routes:done",
        payload=payload,
        handler=handle_route_job,
    )
