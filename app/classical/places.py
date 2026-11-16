"""Offline place search over the downloaded Cambodia OSM place index."""

import json
from functools import lru_cache
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
INDEX_PATH = PROJECT_ROOT / "offline-data" / "places.json"
OVERRIDES_PATH = PROJECT_ROOT / "offline-data" / "places_overrides.json"
PROVINCES_PATH = PROJECT_ROOT / "static" / "data" / "provinces.json"
ALIASES = {"snoul": "snuol"}


@lru_cache(maxsize=1)
def load_places() -> list[dict]:
    if not INDEX_PATH.exists():
        raise FileNotFoundError(f"Offline place index missing: {INDEX_PATH}")
    places = json.loads(INDEX_PATH.read_text())
    if OVERRIDES_PATH.exists():
        overrides = json.loads(OVERRIDES_PATH.read_text())
        by_name = {place["name"].casefold(): place for place in places}
        by_name.update({place["name"].casefold(): place for place in overrides})
        places = list(by_name.values())
    return places


@lru_cache(maxsize=1)
def load_provinces() -> list[dict]:
    """Load the province label coordinates used by the map itself."""
    if not PROVINCES_PATH.exists():
        return []
    return json.loads(PROVINCES_PATH.read_text())


def _province_match(query: str) -> dict | None:
    normalized = query.strip().casefold()
    for province in load_provinces():
        if province["name"].casefold() == normalized:
            return province
    return None


def search_places(query: str, limit: int = 10) -> list[dict]:
    """Search names and aliases without a network request."""
    query = query.strip().casefold()
    query = ALIASES.get(query, query)
    results = []
    province = _province_match(query)
    if province is not None:
        results.append((108, {
            "name": province["name"],
            "aliases": [province["name"]],
            "type": "province",
            "province": province["name"],
            "latitude": province["latitude"],
            "longitude": province["longitude"],
            "osm_id": None,
        }))
    for place in load_places():
        names = [place["name"], *place.get("aliases", [])]
        normalized = [name.casefold() for name in names]
        if query not in " ".join(normalized):
            continue
        exact = any(name == query for name in normalized)
        starts = any(name.startswith(query) for name in normalized)
        type_priority = {"province": 8, "district": 8, "city": 4, "town": 3, "municipality": 3, "village": 2, "suburb": 1}.get(place["type"], 0)
        score = (100 if exact else 50 if starts else 0) + type_priority
        results.append((score, place))
    results.sort(key=lambda item: (-item[0], item[1]["name"].casefold()))
    return [place for _, place in results[:limit]]


def geocode_offline(query: str) -> dict:
    province = _province_match(query)
    if province is not None:
        # Province requests must use the exact coordinate of the province
        # label/pin rendered by the frontend, not a similarly named city node.
        return {
            "query": query,
            "display_name": province["name"],
            "latitude": province["latitude"],
            "longitude": province["longitude"],
            "osm_type": "relation",
            "osm_id": None,
            "detected_type": "state",
            "province": province["name"],
        }
    results = search_places(query, limit=1)
    if not results:
        raise ValueError(f"Offline Cambodian place not found: {query}")
    place = results[0]
    return {
        "query": query,
        "display_name": place["name"],
        "latitude": place["latitude"],
        "longitude": place["longitude"],
        "osm_type": "node",
        "osm_id": place.get("osm_id"),
        "detected_type": place["type"],
        "province": place.get("province"),
    }
