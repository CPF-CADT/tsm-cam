# Quantum Part

TSM-CAM uses QAOA to search for a good Traveling Salesman Problem route.

## Quantum workflow

```text
Distance matrix
    ↓
Weighted graph
    ↓
Qiskit TSP model
    ↓
Quadratic Program
    ↓
QUBO
    ↓
Ising Hamiltonian
    ↓
QAOA circuit
    ↓
Quantum measurements
    ↓
Bitstring decoding
    ↓
Valid route
```

## Main file: `app/quantum/qaoa.py`

### Imports

```python
from qiskit_aer import AerSimulator
from qiskit_aer.primitives import SamplerV2
from qiskit_algorithms.optimizers import COBYLA
from qiskit_optimization.minimum_eigensolvers import QAOA
from qiskit_optimization.applications import Tsp
from qiskit_optimization.converters import QuadraticProgramToQubo
from qiskit_optimization.translators import to_ising
```

Purpose:

- `Tsp`: creates the mathematical TSP problem.
- `QuadraticProgramToQubo`: converts the TSP into binary optimization form.
- `to_ising`: converts QUBO into a Hamiltonian.
- `QAOA`: creates the QAOA algorithm.
- `COBYLA`: classically tunes QAOA parameters.
- `AerSimulator`: simulates quantum circuit execution locally.
- `SamplerV2`: samples circuit results.

### `create_graph(distance_matrix)`

```python
graph = nx.complete_graph(n)
graph[i][j]["weight"] = distances[i, j]
```

Purpose:

- Creates one graph node per location.
- Stores the distance between each pair of locations.
- Provides the weighted graph required by the Qiskit TSP model.

### `create_hamiltonian(graph)`

```python
quadratic_program = Tsp(graph).to_quadratic_program()
qubo = QuadraticProgramToQubo().convert(quadratic_program)
return to_ising(qubo)
```

Purpose:

- Converts the graph into a TSP quadratic program.
- Converts the constrained problem into QUBO.
- Converts QUBO into the Ising Hamiltonian used by QAOA.

### `qaoa_candidates(...)`

This is the main quantum function.

```python
backend = AerSimulator()
sampler = SamplerV2(default_shots=optimizer_shots, seed=42)
```

Purpose:

- Creates the local quantum simulator.
- Configures repeated quantum sampling.
- Uses a fixed seed for repeatable simulator results.

### QAOA configuration

```python
qaoa = QAOA(
    sampler=sampler,
    optimizer=COBYLA(maxiter=30, tol=1e-3),
    reps=1,
    initial_point=np.array([beta, gamma], dtype=float),
)
```

Purpose:

- `reps=1`: uses one QAOA layer.
- `beta`: controls the mixer part.
- `gamma`: controls the cost part.
- `COBYLA`: adjusts `beta` and `gamma` using measured energy.

COBYLA is classical. QAOA is therefore a hybrid quantum-classical algorithm.

### Run QAOA

```python
qaoa_result = qaoa.compute_minimum_eigenvalue(hamiltonian)
```

Purpose:

- Runs the QAOA optimization process.
- Searches for parameters that produce low-energy route states.

### Final quantum sampling

```python
circuit = qaoa.ansatz.remove_final_measurements(inplace=False)
circuit = circuit.assign_parameters(qaoa_result.optimal_point)
circuit.measure_all()

result = backend.run(
    compiled,
    shots=shots,
    seed_simulator=42,
).result()

counts = result.get_counts()
```

Purpose:

- Applies the optimized QAOA parameters.
- Measures every qubit.
- Runs the circuit for the requested number of shots.
- Counts how often each bitstring appears.

### `decode_tour(bitstring, number_of_cities)`

Purpose:

- Converts a measured binary string into a city-position matrix.
- Checks that each city appears once.
- Checks that each position contains one city.
- Returns a TSP tour only when the assignment is valid.

### `rotate_to_depot(tour, depot=0)`

Purpose:

- Rotates a valid cycle so that it starts at the selected departure location.

### Best quantum candidate

```python
for bitstring in sorted(counts, key=counts.get, reverse=True):
    tour = decode_tour(bitstring, len(distance_matrix))
```

Purpose:

- Examines the most frequently measured states first.
- Discards invalid bitstrings.
- Keeps valid quantum tours.
- Returns candidates for final route selection.

## Files that connect to the quantum part

### `app/main.py`

Calls `qaoa_candidates()` when the user selects Quantum mode.

```python
if request.solver_mode == "quantum":
    candidates, counts = qaoa_candidates(...)
```

### `app/schemas.py`

Provides QAOA settings in `RouteRequest`:

- `gamma`
- `beta`
- `shots`
- `solver_mode`

### `app/classical/locations.py` and `app/classical/distances.py`

Creates the distance matrix used as the QAOA input. This part is classical,
but its output becomes the quantum optimization cost.

## Current quantum limitation

The project uses `AerSimulator`, so the circuit is simulated on a classical
computer. It currently uses one QAOA layer and supports one depot with up to
three destinations.

## Alignment with the reference papers

The implementation follows the baseline QAOA-TSP workflow described in the
project's reference papers:

```text
Complete weighted graph
    ↓
TSP quadratic program
    ↓
QUBO
    ↓
Ising Hamiltonian
    ↓
QAOA with COBYLA
    ↓
Measured bitstrings
    ↓
One-hot tour decoding
```

The project applies this workflow as follows:

1. A complete weighted graph is created from the Haversine distance matrix.
2. Qiskit's `Tsp(graph)` creates the quadratic program.
3. The quadratic program is converted to QUBO and then to an Ising Hamiltonian.
4. QAOA runs with COBYLA and one layer (`reps=1`).
5. The optimized circuit is sampled to produce bitstrings.
6. Only valid one-hot TSP assignments are decoded into tours.
7. The selected tour is returned to the application for display.

The current implementation does not include every advanced technique from the
papers. In particular, it does not enable custom XY or row-swap mixers, noise
models, error mitigation, or IBM hardware execution. It uses Qiskit's standard
baseline QAOA workflow with `AerSimulator`.

The displayed map lines are illustrative curved connections. Some lines bend
around the approximate Tonle Sap area for clearer visualization. They are not
proof that real roads are non-overlapping because the quantum cost currently
uses straight-line distances rather than road-segment geometry.

Reference paper titles used by the project:

- *QAOA Variations for the Traveling Salesman Problem*
- *Solving Vehicle Routing Problem Using Quantum Approximate Optimization Algorithm*
- *Hybrid Quantum-Classical Optimisation of Traveling Salesperson Problem*
