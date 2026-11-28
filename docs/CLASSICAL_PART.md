# Classical Part

The classical part prepares the route problem, supports the web application,
and processes the result returned by QAOA.

## Classical workflow

```text
User input
    ↓
Location lookup
    ↓
Coordinates
    ↓
Haversine distance matrix
    ↓
Quantum or classical solver selection
    ↓
Bitstring decoding and validation
    ↓
API response and map display
```

## `app/main.py`

This is the FastAPI application controller.

Purpose:

- Receives browser requests.
- Calls location and distance functions.
- Selects Quantum or Classical mode.
- Sends the distance matrix to QAOA when Quantum mode is selected.
- Returns the final route response.

### Quantum and classical mode selection

- The comparison endpoint resolves the locations once and supplies the same distance matrix to both solvers.
- Quantum mode returns the tour decoded from the most frequently measured final bitstring.
- Classical mode uses Held–Karp dynamic programming to find the minimum-distance tour back to the depot.
- Held–Karp stores the cheapest partial route for each subset of visited destinations and final stop. With `n` destinations, it takes `O(n² · 2ⁿ)` time and `O(n · 2ⁿ)` space.

## `app/schemas.py`

Defines the data entering and leaving the application.

Important models:

- `PickedPoint`: exact coordinates selected on the map.
- `RouteRequest`: depot, destinations, QAOA parameters, and solver mode.
- `GeocodeResult`: resolved location information.
- `RouteResponse`: route, distance, measurements, and result metadata.

Relation to quantum computing: it carries quantum settings but does not run a
quantum circuit.

## `app/classical/places.py`

Searches the local place index.

Purpose:

- Finds Cambodian provinces, districts, towns, and cities.
- Supports offline search.
- Applies known spelling aliases such as `Snoul` and `Snuol`.

Relation to quantum computing: provides the locations that become TSP cities.

## `app/classical/locations.py` and `app/classical/distances.py`

Provides all geographic and distance calculations.

### Geocoding

```python
geocode_many(names)
```

Purpose:

- Converts place names into latitude and longitude.
- Uses online geocoding unless offline mode is enabled.

### Haversine distance

```python
build_straight_distance_matrix(locations)
```

Purpose:

- Calculates straight-line distance between every location pair.
- Creates the weighted matrix passed into the TSP and QAOA model.

### Boundary checks

```python
point_in_cambodia(...)
route_stays_in_cambodia(...)
```

Purpose:

- Checks whether selected points stay inside Cambodia.
- Prevents invalid map selections.

## `app/classical/routes.py`

Formats route results after optimization.

### `make_mock_route(...)`

Purpose:

- Creates illustrative straight lines between selected pins.
- Calculates displayed route distance and estimated duration.
- Does not calculate the QAOA solution.

### `make_leg_results(...)`

Purpose:

- Converts route legs into API-friendly GeoJSON data.
- Provides the frontend with each route segment.

## `static/`

Contains the browser interface and local map assets.

Purpose:

- Displays the Cambodia map.
- Lets the user select locations.
- Sends optimization requests.
- Draws the route returned by the backend.

Relation to quantum computing: **display only**. It does not execute QAOA.

## `templates/`

Contains the main HTML page.

Purpose:

- Provides the route input form.
- Provides the Quantum/Classical mode dropdown.
- Loads the frontend JavaScript and CSS.

Relation to quantum computing: exposes the user control for selecting QAOA.

## `offline-data/`

Contains OpenStreetMap-derived data:

- Cambodia OSM extract.
- PMTiles archive.
- Offline place index.
- Optional OSRM routing files.

Relation to quantum computing: geographic input data only.

## `scripts/`

Contains data preparation scripts for map tiles, boundaries, and place indexes.

Relation to quantum computing: not quantum; these scripts prepare application
data before optimization.
