"""Overlay selected Cambodia OSM roads onto the local land-only PNG tiles."""

import math
import json
import sys
from pathlib import Path

import osmium
from PIL import Image, ImageDraw
from shapely.geometry import Point, shape
from shapely.ops import unary_union
from shapely.prepared import prep


TILE_SIZE = 256
ROAD_TYPES = {
    "motorway": (100, 5),
    "trunk": (95, 5),
    "primary": (82, 4),
    "secondary": (105, 3),
    "tertiary": (120, 2),
    "unclassified": (140, 1),
    "residential": (155, 1),
}


def tile_xy(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    lat = max(-85.05112878, min(85.05112878, lat))
    scale = 2**zoom
    return (
        (lon + 180.0) / 360.0 * scale,
        (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * scale,
    )


class RoadHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.roads = []

    def way(self, way):
        highway = way.tags.get("highway")
        if highway not in ROAD_TYPES:
            return
        points = [(node.lon, node.lat) for node in way.nodes if node.location.valid()]
        if len(points) >= 2:
            self.roads.append((highway, points))


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: build_road_tiles.py cambodia.osm.pbf tiles_dir cambodia.geojson")

    pbf_path = Path(sys.argv[1])
    tiles_dir = Path(sys.argv[2])
    boundary = json.loads(Path(sys.argv[3]).read_text())
    boundary_shape = prep(unary_union([shape(feature["geometry"]) for feature in boundary["features"]]))
    handler = RoadHandler()
    handler.apply_file(str(pbf_path), locations=True)
    print(f"Loaded {len(handler.roads)} road ways")

    for zoom in range(7, 11):
        tile_images = {}
        for tile_path in (tiles_dir / str(zoom)).glob("*/*.png"):
            x = int(tile_path.parent.name)
            y = int(tile_path.stem)
            tile_images[(x, y)] = Image.open(tile_path).convert("RGBA")

        draw_images = {key: ImageDraw.Draw(image) for key, image in tile_images.items()}
        roads = sorted(handler.roads, key=lambda item: ROAD_TYPES[item[0]][1])
        for highway, points in roads:
            color, base_width = ROAD_TYPES[highway]
            width = max(1, base_width + (zoom - 9) // 2)
            rgba = (color, color + 8, color + 16, 190)
            visible_segments = []
            for start, end in zip(points, points[1:]):
                midpoint = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
                if boundary_shape.contains(Point(*midpoint)):
                    visible_segments.append((start, end))
            for start, end in visible_segments:
                projected = [tile_xy(*start, zoom), tile_xy(*end, zoom)]
                min_x = math.floor(min(point[0] for point in projected))
                max_x = math.floor(max(point[0] for point in projected))
                min_y = math.floor(min(point[1] for point in projected))
                max_y = math.floor(max(point[1] for point in projected))
                for x in range(min_x, max_x + 1):
                    for y in range(min_y, max_y + 1):
                        draw = draw_images.get((x, y))
                        if draw is None:
                            continue
                        local_points = [
                            ((px - x) * TILE_SIZE, (py - y) * TILE_SIZE)
                            for px, py in projected
                        ]
                        draw.line(local_points, fill=rgba, width=width)

        for key, image in tile_images.items():
            image.save(tiles_dir / str(zoom) / str(key[0]) / f"{key[1]}.png", optimize=True)
        print(f"Rendered roads at zoom {zoom}")


if __name__ == "__main__":
    main()
