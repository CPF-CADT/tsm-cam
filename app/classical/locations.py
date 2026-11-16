"""Small adapters for Nominatim geocoding and OSRM routing."""

import json
import math
import os
import time
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "https://router.project-osrm.org"
USER_AGENT = "tsm-cam/0.1 academic-route-optimizer"
CAMBODIA_BOUNDS = [[10.30, 102.25], [14.75, 107.75]]
EARTH_RADIUS_KM = 6371.0088
PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROVINCES_PATH = PROJECT_ROOT / "static" / "data" / "provinces.json"

_NAME_ALIASES = {"snoul": "snuol"}


@lru_cache(maxsize=1)
def province_centers() -> dict[str, dict]:
    if not PROVINCES_PATH.exists():
        return {}
    return {item["name"].casefold(): item for item in json.loads(PROVINCES_PATH.read_text())}


def _use_map_province_pin(query: str, location: dict) -> dict:
    """Make online geocoding use the same province pin as the frontend."""
    province = province_centers().get(query.strip().casefold())
    if province is None:
        return location
    return {
        **location,
        "display_name": province["name"],
        "latitude": province["latitude"],
        "longitude": province["longitude"],
        "detected_type": "state",
        "province": province["name"],
    }


def _get_json(url: str) -> dict | list:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def offline_mode() -> bool:
    return os.getenv("TSM_OFFLINE", "0") == "1"


def _result_score(result: dict) -> int:
    """Prefer administrative areas over facilities with similar names."""
    addresstype = result.get("addresstype", "")
    score = 0
    if result.get("osm_type") == "relation":
        score += 30
    if result.get("category") == "boundary":
        score += 30
    if result.get("type") == "administrative":
        score += 30
    if addresstype in {"state", "county", "municipality", "district", "city", "town"}:
        score += 20
    if result.get("category") == "amenity":
        score -= 50
    return score


@lru_cache(maxsize=128)
def geocode(query: str) -> dict:
    """Resolve a province, district, town, or place to one Cambodian coordinate."""
    alias = _NAME_ALIASES.get(query.strip().casefold(), query.strip())
    queries = [f"{query}, Cambodia"]
    if alias.casefold() != query.strip().casefold():
        queries.append(f"{alias}, Cambodia")
    results = []
    for search_query in queries:
        params = urlencode({
            "q": search_query,
            "format": "jsonv2",
            "limit": 10,
            "addressdetails": 1,
            "accept-language": "en",
            "countrycodes": "kh",
        })
        results.extend(_get_json(f"{NOMINATIM_URL}?{params}"))
    results = [item for item in results if item.get("address", {}).get("country_code") == "kh"]
    if not results:
        raise ValueError(f"Cambodian location not found: {query}")
    result = max(results, key=_result_score)
    address = result.get("address", {})
    return _use_map_province_pin(query, {
        "query": query,
        "display_name": result["display_name"],
        "latitude": float(result["lat"]),
        "longitude": float(result["lon"]),
        "osm_type": result.get("osm_type"),
        "osm_id": int(result["osm_id"]) if result.get("osm_id") else None,
        "detected_type": result.get("addresstype") or result.get("type") or "place",
        "province": address.get("state"),
    })


def geocode_many(names: list[str]) -> list[dict]:
    """Geocode sequentially to be polite to the public Nominatim service."""
    results = []
    for index, name in enumerate(names):
        if index:
            time.sleep(1)
        results.append(geocode(name.strip()))
    return results


@lru_cache(maxsize=256)
def search_online(query: str, limit: int = 10) -> list[dict]:
    """Search Cambodian places through Nominatim for interactive suggestions."""
    params = urlencode({
        "q": f"{query.strip()}, Cambodia",
        "format": "jsonv2",
        "limit": limit,
        "addressdetails": 1,
        "accept-language": "en",
        "countrycodes": "kh",
    })
    results = _get_json(f"{NOMINATIM_URL}?{params}")
    places = []
    for result in results:
        if result.get("address", {}).get("country_code") != "kh":
            continue
        address = result.get("address", {})
        places.append(_use_map_province_pin(query, {
            "query": query,
            "display_name": result.get("display_name", query),
            "latitude": float(result["lat"]),
            "longitude": float(result["lon"]),
            "osm_type": result.get("osm_type"),
            "osm_id": int(result["osm_id"]) if result.get("osm_id") else None,
            "detected_type": result.get("addresstype") or result.get("type") or "place",
            "province": address.get("state"),
        }))
    return places


def reverse_geocode(latitude: float, longitude: float) -> dict:
    """Resolve one clicked map coordinate to a readable Cambodian label."""
    params = urlencode({
        "lat": latitude,
        "lon": longitude,
        "format": "jsonv2",
        "zoom": 10,
        "addressdetails": 1,
        "accept-language": "en",
    })
    result = _get_json(f"https://nominatim.openstreetmap.org/reverse?{params}")
    address = result.get("address", {})
    if address.get("country_code") != "kh":
        raise ValueError("Choose a location inside Cambodia")
    label = (
        address.get("city") or address.get("town") or address.get("village")
        or address.get("county") or address.get("state") or "Pinned location"
    )
    return {
        "query": label,
        "display_name": result.get("display_name", label),
        "latitude": latitude,
        "longitude": longitude,
        "osm_type": "coordinate",
        "osm_id": None,
        "detected_type": result.get("addresstype") or "place",
        "province": address.get("state"),
    }


@lru_cache(maxsize=1)
def cambodia_boundary() -> dict:
    """Fetch and cache Cambodia's OSM boundary for the browser map."""
    local_boundary = PROJECT_ROOT / "static" / "data" / "cambodia.geojson"
    if local_boundary.exists():
        return json.loads(local_boundary.read_text())
    params = urlencode({
        "q": "Cambodia",
        "format": "geojson",
        "polygon_geojson": 1,
        "limit": 1,
        "countrycodes": "kh",
    })
    data = _get_json(f"{NOMINATIM_URL}?{params}")
    if not data.get("features"):
        raise ValueError("Cambodia boundary could not be loaded")
    return data


def _point_in_ring(longitude: float, latitude: float, ring: list[list[float]]) -> bool:
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous[0], previous[1]
        x2, y2 = current[0], current[1]
        crosses = (y1 > latitude) != (y2 > latitude)
        if crosses and longitude < (x2 - x1) * (latitude - y1) / (y2 - y1) + x1:
            inside = not inside
        previous = current
    return inside


def point_in_cambodia(longitude: float, latitude: float, boundary: dict) -> bool:
    """Check a longitude/latitude point against the cached OSM boundary."""
    for feature in boundary.get("features", []):
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates", [])
        if geometry.get("type") == "Polygon":
            polygons = [coordinates]
        elif geometry.get("type") == "MultiPolygon":
            polygons = coordinates
        else:
            continue
        for polygon in polygons:
            if _point_in_ring(longitude, latitude, polygon[0]):
                return not any(_point_in_ring(longitude, latitude, hole) for hole in polygon[1:])
    return False


def route_stays_in_cambodia(route: dict, boundary: dict) -> bool:
    geometry = route.get("geometry", {})
    return all(
        point_in_cambodia(longitude, latitude, boundary)
        for longitude, latitude in geometry.get("coordinates", [])
    )


def _coordinate_string(locations: list[dict]) -> str:
    return ";".join(f"{item['longitude']},{item['latitude']}" for item in locations)


def build_distance_matrix(locations: list[dict], profile: str = "driving") -> dict:
    """Get pairwise real-road distance and duration matrices from OSRM."""
    coordinates = _coordinate_string(locations)
    router_url = os.getenv("TSM_OSRM_URL", OSRM_URL)
    url = f"{router_url}/table/v1/{profile}/{coordinates}?annotations=distance,duration"
    data = _get_json(url)
    if data.get("code") != "Ok":
        raise ValueError(f"OSRM table error: {data.get('code', 'unknown')}")
    return {"distances": data["distances"], "durations": data["durations"]}


def build_straight_distance_matrix(locations: list[dict]) -> dict:
    """Calculate pairwise great-circle distances locally in kilometers."""
    matrix = []
    for start in locations:
        row = []
        start_lat = math.radians(float(start["latitude"]))
        start_lon = math.radians(float(start["longitude"]))
        for end in locations:
            end_lat = math.radians(float(end["latitude"]))
            end_lon = math.radians(float(end["longitude"]))
            delta_lat = end_lat - start_lat
            delta_lon = end_lon - start_lon
            haversine_a = (
                math.sin(delta_lat / 2) ** 2
                + math.cos(start_lat) * math.cos(end_lat) * math.sin(delta_lon / 2) ** 2
            )
            central_angle = 2 * math.atan2(
                math.sqrt(haversine_a), math.sqrt(max(0.0, 1 - haversine_a))
            )
            row.append(EARTH_RADIUS_KM * central_angle)
        matrix.append(row)
    return {"distances": matrix, "durations": []}


def build_route(locations: list[dict], order: list[int], profile: str = "driving") -> dict:
    """Get final route geometry and road-node annotations."""
    ordered = [locations[index] for index in order]
    coordinates = _coordinate_string(ordered)
    query = "?overview=full&geometries=geojson&steps=true&annotations=nodes"
    router_url = os.getenv("TSM_OSRM_URL", OSRM_URL)
    data = _get_json(f"{router_url}/route/v1/{profile}/{coordinates}{query}")
    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError(f"OSRM route error: {data.get('code', 'unknown')}")
    return data["routes"][0]


def route_segments(route: dict) -> set[tuple[int, int]]:
    """Extract normalized road-node segments from OSRM annotations."""
    segments: set[tuple[int, int]] = set()
    for leg in route.get("legs", []):
        nodes = (leg.get("annotation") or {}).get("nodes") or []
        for start, end in zip(nodes, nodes[1:]):
            if start != end:
                segments.add(tuple(sorted((int(start), int(end)))))
    return segments


def build_pairwise_route_segments(locations: list[dict], profile: str = "driving") -> dict[tuple[int, int], set[tuple[int, int]]]:
    """Precompute road segments for every directed pair before quantum sampling."""
    pair_segments = {}
    for start in range(len(locations)):
        for end in range(len(locations)):
            if start == end:
                continue
            pair_segments[(start, end)] = route_segments(
                build_route(locations, [start, end], profile)
            )
    return pair_segments
