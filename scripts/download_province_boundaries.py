"""Download Cambodia province boundaries once for local offline display."""

import json
import sys
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PROVINCES = [
    "Banteay Meanchey", "Battambang", "Kampong Cham", "Kampong Chhnang",
    "Kampong Speu", "Kampong Thom", "Kampot", "Kandal", "Kep", "Koh Kong",
    "Kratie", "Mondulkiri", "Oddar Meanchey", "Pailin", "Phnom Penh",
    "Preah Sihanouk", "Preah Vihear", "Pursat", "Ratanakiri", "Siem Reap",
    "Prey Veng", "Stung Treng", "Svay Rieng", "Takeo", "Tbong Khmum",
]


def main() -> None:
    output = Path(sys.argv[1] if len(sys.argv) > 1 else "static/data/provinces.geojson")
    features = []
    for index, name in enumerate(PROVINCES):
        params = urlencode({
            "q": f"{name}, Cambodia",
            "format": "geojson",
            "polygon_geojson": 1,
            "featuretype": "state",
            "limit": 1,
            "countrycodes": "kh",
            "accept-language": "en",
        })
        request = Request(
            f"https://nominatim.openstreetmap.org/search?{params}",
            headers={"User-Agent": "tsm-cam/0.1 academic-route-optimizer"},
        )
        with urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
        if not data.get("features"):
            raise RuntimeError(f"Province boundary not found: {name}")
        feature = data["features"][0]
        feature["properties"] = {"name": name, "source": "OpenStreetMap"}
        features.append(feature)
        print(f"Downloaded {index + 1}/{len(PROVINCES)}: {name}")
        time.sleep(1.1)

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        "type": "FeatureCollection",
        "licence": "Data © OpenStreetMap contributors, ODbL 1.0",
        "features": features,
    }, ensure_ascii=False))
    print(f"Wrote {len(features)} province boundaries to {output}")


if __name__ == "__main__":
    main()
