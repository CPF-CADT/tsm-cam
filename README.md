# TSM-CAM: A Hybrid Quantum-Classical Route Optimization System for Cambodia Using QAOA

TSM-CAM is a Cambodia route-order optimizer.

![TSM-CAM system demo](demo.jpg)

It allows a user to:

- Select one departure location and up to three destinations.
- Search for Cambodian provinces, districts, cities, and towns.
- Pick locations directly from the map.
- Calculate straight-line distances using the Haversine formula.
- Optimize the visit order using Quantum QAOA or classical Held–Karp dynamic programming.
- Display the selected route on a Cambodia map.

The quantum workflow is:

```text
Distance matrix → TSP → QUBO → Ising Hamiltonian → QAOA → measured route
```

The quantum backend uses a fixed-depot encoding, a permutation-swap mixer, and
Qiskit's local `AerSimulator`. Adjust the default circuit and sampling settings
in [`app/quantum/config.py`](app/quantum/config.py). The displayed map
lines are illustrative straight connections between locations, not turn-by-turn
road geometry.

The flight-time estimate uses straight-line distance and the Airbus H125's
published fast cruise speed of 252 km/h. It represents cruise time between
stops. [Airbus civil helicopter specifications](https://www.airbus.com/sites/g/files/jlcbta136/files/2022-10/2022-Civil%20Range.pdf)

Large offline map archives and generated tiles are intentionally excluded from
Git. Keep them locally for offline operation or generate/download them using
the scripts in `scripts/`.

## How to run

From the project directory:

```bash
pip install -r requirements.txt
```

```bash
uvicorn app.main:app --reload
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
