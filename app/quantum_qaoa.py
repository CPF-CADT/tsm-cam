"""QAOA-TSP implementation using Qiskit's supported optimization workflow."""

import networkx as nx
import numpy as np
from qiskit import transpile
from qiskit.transpiler import generate_preset_pass_manager
from qiskit_aer import AerSimulator
from qiskit_aer.primitives import SamplerV2
from qiskit_algorithms.optimizers import COBYLA
from qiskit_optimization.minimum_eigensolvers import QAOA
from qiskit_optimization.applications import Tsp
from qiskit_optimization.converters import QuadraticProgramToQubo
from qiskit_optimization.translators import to_ising


def create_graph(distance_matrix):
    distances = np.asarray(distance_matrix, dtype=float)
    n = len(distances)
    if distances.shape != (n, n):
        raise ValueError("Distance matrix must be square")
    graph = nx.complete_graph(n)
    for i, j in graph.edges:
        graph[i][j]["weight"] = distances[i, j]
    return graph


def create_hamiltonian(graph):
    quadratic_program = Tsp(graph).to_quadratic_program()
    qubo = QuadraticProgramToQubo().convert(quadratic_program)
    return to_ising(qubo)


def tour_bitstring(tour: list[int], number_of_cities: int) -> str:
    """Encode a tour using the same Qiskit TSP variable order as decode_tour."""
    assignment = np.zeros((number_of_cities, number_of_cities), dtype=int)
    for position, city in enumerate(tour[:-1]):
        assignment[city, position] = 1
    return "".join(str(bit) for bit in assignment.reshape(-1)[::-1])


def decode_tour(bitstring: str, number_of_cities: int) -> list[int] | None:
    assignment = np.array([int(bit) for bit in reversed(bitstring)]).reshape(
        number_of_cities, number_of_cities
    )
    valid = (
        all(assignment[city, :].sum() == 1 for city in range(number_of_cities))
        and all(assignment[:, position].sum() == 1 for position in range(number_of_cities))
    )
    if not valid:
        return None
    tour = [int(np.flatnonzero(assignment[:, position])[0]) for position in range(number_of_cities)]
    return tour + [tour[0]]


def rotate_to_depot(tour: list[int], depot: int = 0) -> list[int]:
    cycle = tour[:-1]
    start = cycle.index(depot)
    return cycle[start:] + cycle[:start] + [depot]


def qaoa_candidates(distance_matrix, gamma, beta, shots, depot=0, limit=24, allowed_tours=None):
    """Optimize and sample the TSP Hamiltonian with official Qiskit QAOA."""
    graph = create_graph(distance_matrix)
    hamiltonian, _ = create_hamiltonian(graph)
    allowed_keys = {tuple(tour) for tour in allowed_tours} if allowed_tours else None
    optimizer_shots = min(shots, 4096)
    backend = AerSimulator()
    pass_manager = generate_preset_pass_manager(
        backend=backend,
        optimization_level=1,
    )
    sampler = SamplerV2(default_shots=optimizer_shots, seed=42)
    qaoa = QAOA(
        sampler=sampler,
        optimizer=COBYLA(maxiter=30, tol=1e-3),
        reps=1,
        pass_manager=pass_manager,
        # Qiskit's QAOA parameter order is beta, gamma.
        initial_point=np.array([beta, gamma], dtype=float),
    )
    qaoa_result = qaoa.compute_minimum_eigenvalue(hamiltonian)

    # Sample the optimized circuit with the requested final shot count.
    circuit = qaoa.ansatz.remove_final_measurements(inplace=False)
    circuit = circuit.assign_parameters(qaoa_result.optimal_point)
    circuit.measure_all()
    compiled = transpile(circuit, backend)
    result = backend.run(compiled, shots=shots, seed_simulator=42).result()
    counts = result.get_counts()

    # Keep the optimizer's best measured state as a quantum result as well.
    # This prevents a valid state from disappearing only because it was not
    # repeated in the separate final sampling pass.
    best_measurement = getattr(qaoa_result, "best_measurement", None) or {}
    best_bitstring = best_measurement.get("bitstring")
    if best_bitstring and best_bitstring not in counts:
        counts[best_bitstring] = 1

    candidates = []
    seen = set()
    for bitstring in sorted(counts, key=counts.get, reverse=True):
        tour = decode_tour(bitstring, len(distance_matrix))
        if tour is None:
            continue
        tour = rotate_to_depot(tour, depot)
        if allowed_keys is not None and tuple(tour) not in allowed_keys:
            continue
        key = tuple(tour)
        if key not in seen:
            seen.add(key)
            candidates.append({"tour": tour, "bitstring": bitstring, "count": counts[bitstring]})
        if len(candidates) >= limit:
            break
    return candidates, counts

