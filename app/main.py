from pathlib import Path
import os
import struct
import zlib
from itertools import permutations

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .classical_compute_maps import (
    CAMBODIA_BOUNDS,
    build_straight_distance_matrix,
    cambodia_boundary,
    geocode_many,
    reverse_geocode,
    search_online,
)
from .initial_offline_places import geocode_offline, search_places
from .initial_schemas import GeocodeResult, RouteRequest, RouteResponse
from .output_routes import make_leg_results, make_mock_route
from .quantum_qaoa import qaoa_candidates


BASE_DIR = Path(__file__).resolve().parent.parent
STRAIGHT_LINE_SPEED_KMH = 60.0
app = FastAPI(title="TSM-CAM Route Optimizer", version="0.1.0")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


def _blank_tile_png() -> bytes:
    """Return a land-colored 256px PNG for tiles outside offline coverage."""
    width = height = 256
    rgb = (226, 238, 219)
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


BLANK_TILE = _blank_tile_png()


@app.get("/", response_class=FileResponse)
def index():
    return FileResponse(BASE_DIR / "templates" / "index.html")


@app.get("/tiles/{zoom}/{x}/{y}.png")
def offline_tile(zoom: int, x: int, y: int):
    """Serve a local tile, or a blank local tile outside downloaded coverage."""
    tile_path = BASE_DIR / "static" / "tiles" / str(zoom) / str(x) / f"{y}.png"
    if tile_path.is_file():
        return FileResponse(tile_path, media_type="image/png")
    return Response(
        content=BLANK_TILE,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/offline/cambodia.pmtiles")
def cambodia_pmtiles(request: Request):
    """Serve the local PMTiles archive with byte-range support."""
    archive = BASE_DIR / "offline-data" / "cambodia.pmtiles"
    if not archive.is_file():
        raise HTTPException(status_code=404, detail="Cambodia PMTiles archive is missing")
    size = archive.stat().st_size
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(archive, media_type="application/vnd.pmtiles")
    try:
        start_text, end_text = range_header.removeprefix("bytes=").split("-", 1)
        start = int(start_text or 0)
        end = int(end_text) if end_text else size - 1
        end = min(end, size - 1)
        if start < 0 or start > end:
            raise ValueError
    except ValueError as exc:
        raise HTTPException(status_code=416, detail="Invalid byte range") from exc
    with archive.open("rb") as stream:
        stream.seek(start)
        content = stream.read(end - start + 1)
    return Response(
        content=content,
        status_code=206,
        media_type="application/vnd.pmtiles",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(len(content)),
            "Cache-Control": "public, max-age=86400",
        },
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/favicon.ico", status_code=204)
def favicon():
    return Response(status_code=204)


@app.get("/api/map/cambodia")
def cambodia_map():
    return {"bounds": CAMBODIA_BOUNDS, "boundary": cambodia_boundary()}


@app.get("/api/geocode", response_model=list[GeocodeResult])
def geocode_endpoint(query: str):
    try:
        if os.getenv("TSM_OFFLINE", "0") == "1":
            return [geocode_offline(query)]
        return geocode_many([query])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/places", response_model=list[GeocodeResult])
def places_endpoint(query: str):
    try:
        if os.getenv("TSM_OFFLINE", "0") == "1":
            return [
                {
                    "query": place["name"],
                    "display_name": place["name"],
                    "latitude": place["latitude"],
                    "longitude": place["longitude"],
                    "osm_type": "node",
                    "osm_id": place.get("osm_id"),
                    "detected_type": place["type"],
                    "province": place.get("province"),
                }
                for place in search_places(query)
            ]
        return search_online(query)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/reverse", response_model=GeocodeResult)
def reverse_endpoint(latitude: float, longitude: float):
    try:
        if not (10.30 <= latitude <= 14.75 and 102.25 <= longitude <= 107.75):
            raise ValueError("Choose a location inside Cambodia")
        if os.getenv("TSM_OFFLINE", "0") == "1":
            return {
                "query": "Pinned location",
                "display_name": "Pinned location",
                "latitude": latitude,
                "longitude": longitude,
                "osm_type": "coordinate",
                "osm_id": None,
                "detected_type": "map_pin",
                "province": None,
            }
        return reverse_geocode(latitude, longitude)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/routes/optimize", response_model=RouteResponse)
def optimize_route(request: RouteRequest):
    names = [request.depot, *request.destinations]
    normalized = [name.strip().casefold() for name in names]
    if len(set(normalized)) != len(normalized):
        raise HTTPException(status_code=400, detail="Depot and destinations must be unique")
    if len(names) > 4:
        raise HTTPException(
            status_code=400,
            detail="The academic demo supports 1 depot and up to 3 destinations",
        )

    try:
        # 1. Resolve typed names or exact map-picked coordinates.
        points = [request.depot_point, *request.destination_points]
        typed_indices = [index for index, point in enumerate(points) if point is None]
        typed_names = [names[index] for index in typed_indices]
        typed_locations = (
            [geocode_offline(name) for name in typed_names]
            if os.getenv("TSM_OFFLINE", "0") == "1"
            else geocode_many(typed_names)
        )
        typed_location_by_index = dict(zip(typed_indices, typed_locations))
        locations = []
        for index, name in enumerate(names):
            point = points[index] if index < len(points) else None
            if point is not None:
                locations.append({
                    "query": point.query,
                    "display_name": point.query,
                    "latitude": point.latitude,
                    "longitude": point.longitude,
                    "osm_type": "coordinate",
                    "osm_id": None,
                    "detected_type": "map_pin",
                    "province": None,
                })
            else:
                locations.append(typed_location_by_index[index])
        # 2. Build the local straight-line distance matrix in kilometers.
        matrix_data = build_straight_distance_matrix(locations)
        distances = matrix_data["distances"]
        durations = matrix_data.get("durations", [])
        quantum_tours = []
        for order in permutations(range(1, len(locations))):
            tour = [0, *order, 0]
            # Keep every valid TSP permutation. Road overlap is scored after measurement.
            quantum_tours.append(tour)

        def check_candidates(candidate_list):
            checked_routes = []
            for candidate in candidate_list:
                route = make_mock_route(locations, candidate["tour"], distances, durations)
                # Mock lines have no real road segments to compare.
                outside_cambodia = False
                repeated = set()
                checked_routes.append((bool(repeated), outside_cambodia, route["distance"], candidate, route, repeated))
            return checked_routes

        counts = {}
        quantum_candidate = None
        classical_selected = None
        if request.solver_mode == "quantum":
            # Quantum mode runs QAOA only.
            candidates, counts = qaoa_candidates(
                distances,
                request.gamma,
                request.beta,
                request.shots,
                depot=0,
                allowed_tours=quantum_tours,
            )
            if not candidates:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "QAOA did not measure a valid TSP permutation. "
                        f"Increase shots or tune gamma/beta. shots={request.shots}"
                    ),
                )
            checked = check_candidates(candidates)
        else:
            # Classical mode runs exhaustive search only; no QAOA is started.
            classical_candidates = [
                {"tour": tour, "bitstring": "", "count": 0}
                for tour in quantum_tours
            ]
            checked = check_candidates(classical_candidates)

        # Select the shortest valid tour by straight-line distance.
        inside = [item for item in checked if not item[1]]
        if not inside:
            raise HTTPException(status_code=422, detail="No route staying inside Cambodia was found")
        selected = min(inside, key=lambda item: item[2])
        has_repeated, outside_cambodia, _, candidate, route, repeated = selected
        ordered_names = [locations[index]["query"] for index in candidate["tour"]]
        legs = make_leg_results(route, locations, candidate["tour"])
        solver = request.solver_mode
        return RouteResponse(
            status="success" if not outside_cambodia else "outside_cambodia",
            solver=solver,
            message=f"{solver.title()} route selected using straight-line distance",
            locations=locations,
            order=candidate["tour"],
            ordered_names=ordered_names,
            distance_meters=route["distance"],
            duration_seconds=route["duration"],
            geometry=route.get("geometry"),
            legs=legs,
            repeated_segments=[str(item) for item in sorted(repeated)],
            boundary_violation=outside_cambodia,
            selected_bitstring=(candidate["bitstring"] or None),
            top_measurements=dict(sorted(counts.items(), key=lambda item: item[1], reverse=True)[:10]),
            validation_enabled=False,
            winner=request.solver_mode,
            quantum_ordered_names=ordered_names if request.solver_mode == "quantum" else [],
            quantum_distance_meters=route["distance"] if request.solver_mode == "quantum" else None,
            quantum_repeated_segments=[],
            quantum_bitstring=candidate["bitstring"] or None if request.solver_mode == "quantum" else None,
            classical_ordered_names=ordered_names if request.solver_mode == "classical" else [],
            classical_distance_meters=route["distance"] if request.solver_mode == "classical" else None,
            classical_repeated_segments=[],
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
