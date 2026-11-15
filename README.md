# TSM-CAM: A Hybrid Quantum-Classical Route Optimization System for Cambodia Using QAOA

TSM-CAM is a Cambodia route-order optimizer.

It allows a user to:

- Select one departure location and up to three destinations.
- Search for Cambodian provinces, districts, cities, and towns.
- Pick locations directly from the map.
- Calculate straight-line distances using the Haversine formula.
- Optimize the visit order using Quantum QAOA or Classical search.
- Display the selected route on a Cambodia map.

The quantum workflow is:

```text
Distance matrix → TSP → QUBO → Ising Hamiltonian → QAOA → measured route
```

The current quantum backend is Qiskit's local `AerSimulator`. The displayed map
lines are illustrative straight connections between locations, not turn-by-turn
road geometry.

Large offline map archives and generated tiles are intentionally excluded from
Git. Keep them locally for offline operation or generate/download them using
the scripts in `scripts/`.

## How to run

From the project directory:

```bash
cd /Users/nak/CADT/CADT_Fourth_Year/quantum/implement/tsm-cam
../.venv/bin/pip install -r requirements.txt
../.venv/bin/uvicorn app.main:app --reload
```

Open this address in a browser:

```text
http://127.0.0.1:8000
```

For offline place lookup and map picking:

```bash
TSM_OFFLINE=1 ../.venv/bin/uvicorn app.main:app --reload
```

## Detailed documentation

For detailed code purpose and architecture, read:

- [Quantum part](docs/QUANTUM_PART.md)
- [Classical part](docs/CLASSICAL_PART.md)
- [Project structure and quantum relationships](docs/PROJECT_STRUCTURE.md)
