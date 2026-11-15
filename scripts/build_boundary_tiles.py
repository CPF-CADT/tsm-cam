"""Build lightweight offline Leaflet tiles showing Cambodia and surrounding sea."""

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw


TILE_SIZE = 256
LAND = (224, 235, 215, 255)
BORDER = (174, 193, 171, 255)


def tile_xy(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    lat = max(-85.05112878, min(85.05112878, lat))
    scale = 2**zoom
    x = (lon + 180.0) / 360.0 * scale
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * scale
    return x, y


def geometry_polygons(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    if geometry["type"] == "MultiPolygon":
        return [ring for polygon in geometry["coordinates"] for ring in polygon]
    return []


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_boundary_tiles.py boundary.geojson output_dir")

    boundary_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    collection = json.loads(boundary_path.read_text())
    rings = []
    for feature in collection["features"]:
        rings.extend(geometry_polygons(feature["geometry"]))

    all_points = [point for ring in rings for point in ring]
    min_lon = min(point[0] for point in all_points) - 0.2
    max_lon = max(point[0] for point in all_points) + 0.2
    min_lat = min(point[1] for point in all_points) - 0.2
    max_lat = max(point[1] for point in all_points) + 0.2

    for zoom in range(0, 11):
        min_x, max_y = tile_xy(min_lon, min_lat, zoom)
        max_x, min_y = tile_xy(max_lon, max_lat, zoom)
        for x in range(max(0, math.floor(min_x) - 1), math.ceil(max_x) + 2):
            for y in range(max(0, math.floor(min_y) - 1), math.ceil(max_y) + 2):
                # Use one land-colored canvas so no sea border is shown.
                image = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), LAND)
                draw = ImageDraw.Draw(image)
                points_for_tile = []
                for ring in rings:
                    points = []
                    for lon, lat in ring:
                        px, py = tile_xy(lon, lat, zoom)
                        points.append(((px - x) * TILE_SIZE, (py - y) * TILE_SIZE))
                    points_for_tile.append(points)
                for points in points_for_tile:
                    draw.polygon(points, fill=LAND)
                for points in points_for_tile:
                    draw.line(points + [points[0]], fill=BORDER, width=max(1, 5 - zoom // 3), joint="curve")
                tile_path = output_dir / str(zoom) / str(x) / f"{y}.png"
                tile_path.parent.mkdir(parents=True, exist_ok=True)
                image.save(tile_path, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
