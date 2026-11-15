"""Build a small offline place-search index from a Cambodia OSM PBF file."""

import json
import sys
from pathlib import Path

import osmium


ALLOWED_PLACE_TYPES = {
    "city", "town", "village", "hamlet", "suburb", "quarter", "municipality"
}


class PlaceHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.places = []

    def node(self, node):
        tags = dict(node.tags)
        place_type = tags.get("place")
        if not node.location.valid() or place_type not in ALLOWED_PLACE_TYPES:
            return
        name = tags.get("name:en") or tags.get("int_name") or tags.get("name")
        if not name:
            return
        self.places.append({
            "name": name,
            "aliases": [value for value in [tags.get("name:en"), tags.get("int_name"), tags.get("name")] if value],
            "type": place_type,
            "province": tags.get("addr:province") or tags.get("is_in:state"),
            "latitude": node.location.lat,
            "longitude": node.location.lon,
            "osm_id": node.id,
        })


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_places_index.py INPUT.osm.pbf OUTPUT.json")
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    handler = PlaceHandler()
    handler.apply_file(str(input_path), locations=False)

    unique = {}
    for place in handler.places:
        key = (place["name"].casefold(), round(place["latitude"], 4), round(place["longitude"], 4))
        unique[key] = place
    places = sorted(unique.values(), key=lambda item: item["name"].casefold())
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(places, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(places)} places to {output_path}")


if __name__ == "__main__":
    main()
