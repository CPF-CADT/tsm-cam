# TSM-CAM Project Structure

TSM-CAM is a hybrid route optimizer. It uses classical software to prepare the
route problem and QAOA to search for a good TSP route.

## Project flow

```text
User input
    ↓
Location lookup and coordinates
    ↓
Classical Haversine distance matrix
    ↓
TSP model → QUBO → Ising Hamiltonian
    ↓
QAOA quantum circuit and measurements
    ↓
Classical bitstring decoding and validation
    ↓
Route response and map display
```

## Source files

### `app/main.py`

Application controller and FastAPI endpoints.

Responsibilities:

- Receives route requests from the browser.
- Calls location lookup and distance preparation.
- Selects Quantum or Classical mode.
- Calls `quantum/qaoa.py` in Quantum mode.
- Formats the API response.

Relation to quantum computing: **orchestration only**. It starts the QAOA
workflow but does not define the quantum circuit itself.

### `app/schemas.py`

Defines input and output data models:

- `RouteRequest`
- `PickedPoint`
- `GeocodeResult`
- `RouteResponse`

Relation to quantum computing: **indirect**. It carries quantum settings such
as `gamma`, `beta`, `shots`, and `solver_mode`.

### `app/classical/places.py`

Searches the local Cambodia place index when offline mode is enabled.

Relation to quantum computing: **not quantum**. It prepares the locations that
will later become TSP cities.

### `app/classical/locations.py` and `app/classical/distances.py`

Handles classical geographic calculations:

- Online geocoding through Nominatim.
- Reverse geocoding.
- Cambodia boundary checks.
- Haversine straight-line distance calculation.
- Distance matrix creation.
- Optional routing helpers.

Relation to quantum computing: **classical input preparation**. The distance
matrix produced here becomes the weight used by the quantum TSP model.

### `app/quantum/qaoa.py`

This is the main quantum-computing file.

Responsibilities:

- Creates the weighted graph.
- Converts the graph into a Qiskit TSP model.
- Converts the TSP model into a Quadratic Program.
- Converts the Quadratic Program into QUBO.
- Converts QUBO into an Ising Hamiltonian.
- Creates and runs QAOA.
- Uses `AerSimulator` and `SamplerV2`.
- Samples quantum bitstrings.
- Decodes valid bitstrings into tours.

Important functions:

```python
create_graph()
```

Creates a weighted graph from the distance matrix.

```python
create_hamiltonian()
```

Performs:

```text
TSP → Quadratic Program → QUBO → Ising Hamiltonian
```

```python
qaoa_candidates()
```

Runs the main QAOA workflow.

```python
decode_tour()
```

Converts a measured quantum bitstring into a city order.

```python
rotate_to_depot()
```

Ensures the returned route starts at the departure city.

Relation to quantum computing: **core quantum implementation**.

### `app/classical/routes.py`

Creates route legs and illustrative pin-to-pin GeoJSON lines for the frontend.

Relation to quantum computing: **post-processing only**. It visualizes the
route selected after QAOA; it does not change the quantum result.

## Other project folders

### `static/`

Contains browser assets:

- HTML-related JavaScript and CSS.
- MapLibre GL JS.
- PMTiles support.
- Cambodia map style.
- Cambodia boundary and province data.

Relation to quantum computing: **not quantum**. It displays the locations and
the route returned by the backend.

### `templates/`

Contains the main HTML page for the web interface.

Relation to quantum computing: **not quantum**. It provides the user interface
for selecting Quantum or Classical mode.

### `offline-data/`

Contains geographic data:

- Cambodia OSM extract.
- PMTiles map archive.
- Offline place index.
- Optional OSRM routing files.

Relation to quantum computing: **input data only**. Geographic data is used to
create coordinates and distances before QAOA starts.

### `scripts/`

Contains data preparation utilities for places, boundaries, roads, and map
tiles.

Relation to quantum computing: **not quantum**. These scripts prepare map data.

### `docs/`

Contains project documentation explaining architecture and quantum concepts.

### `papers/` or project paper references

The reference papers describe QAOA, TSP encoding, QUBO, Ising Hamiltonians, and
hybrid quantum-classical optimization.

## Quantum versus classical responsibility

| Component | Responsibility | Quantum relation |
|---|---|---|
| Location lookup | Find coordinates | Classical preparation |
| Haversine distance | Calculate weights | Classical input |
| Graph creation | Build TSP graph | Preparation for Qiskit |
| TSP model | Define optimization problem | Quantum optimization model |
| QUBO | Encode binary optimization | Quantum-compatible formulation |
| Ising Hamiltonian | Encode energy function | Quantum cost model |
| QAOA | Search candidate solutions | Core quantum algorithm |
| COBYLA | Tune `beta` and `gamma` | Classical part of hybrid QAOA |
| AerSimulator | Execute circuit locally | Quantum simulation |
| Shots | Repeat circuit measurements | Quantum sampling |
| Bitstring decoding | Interpret measured result | Classical post-processing |
| Map display | Show route | Application output |

## Important limitation

The current project uses `AerSimulator`, so the quantum circuit is simulated on
a classical computer. The implementation follows the baseline QAOA-TSP process,
but it is not currently running on IBM quantum hardware.
