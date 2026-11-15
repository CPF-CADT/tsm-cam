"""Format route legs and illustrative route geometry for API output."""


def make_leg_results(route: dict, locations: list[dict], order: list[int]) -> list[dict]:
    """Convert route legs into separate GeoJSON lines for the frontend."""
    legs = []
    for index, leg in enumerate(route.get("legs", [])):
        coordinates = []
        for step in leg.get("steps", []):
            step_coordinates = (step.get("geometry") or {}).get("coordinates", [])
            if coordinates and step_coordinates and coordinates[-1] == step_coordinates[0]:
                coordinates.extend(step_coordinates[1:])
            else:
                coordinates.extend(step_coordinates)
        legs.append({
            "from_index": order[index],
            "to_index": order[index + 1],
            "from_name": locations[order[index]]["query"],
            "to_name": locations[order[index + 1]]["query"],
            "distance_meters": leg.get("distance", 0),
            "duration_seconds": leg.get("duration", 0),
            "geometry": {"type": "LineString", "coordinates": coordinates},
        })
    return legs


def make_mock_route(
    locations: list[dict],
    order: list[int],
    distances: list[list[float]],
    durations: list[list[float | None]],
    speed_kmh: float = 60.0,
) -> dict:
    """Build illustrative straight lines from local Haversine distances."""
    legs = []
    route_coordinates = []
    total_distance = 0.0
    total_duration = 0.0
    for start, end in zip(order, order[1:]):
        start_coordinate = [locations[start]["longitude"], locations[start]["latitude"]]
        end_coordinate = [locations[end]["longitude"], locations[end]["latitude"]]
        if not route_coordinates:
            route_coordinates.append(start_coordinate)
        route_coordinates.append(end_coordinate)
        distance_km = float(distances[start][end] or 0)
        duration = (
            float((durations[start][end] if durations else 0) or 0)
            or distance_km / speed_kmh * 3600
        )
        distance_meters = distance_km * 1000
        total_distance += distance_meters
        total_duration += duration
        legs.append({
            "distance": distance_meters,
            "duration": duration,
            "steps": [{"geometry": {"coordinates": [start_coordinate, end_coordinate]}}],
        })
    return {
        "distance": total_distance,
        "duration": total_duration,
        "geometry": {"type": "LineString", "coordinates": route_coordinates},
        "legs": legs,
    }
