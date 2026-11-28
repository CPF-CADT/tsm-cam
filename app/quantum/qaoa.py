"""Fixed-depot QAOA with a feasibility-preserving permutation mixer."""

from dataclasses import dataclass
from itertools import combinations
from time import perf_counter

import networkx as nx
import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit.circuit import Parameter
from qiskit.circuit.library import PauliEvolutionGate
from qiskit.quantum_info import Operator, SparsePauliOp
from qiskit.transpiler import generate_preset_pass_manager
from qiskit_aer import AerSimulator
from qiskit_aer.primitives import SamplerV2
from qiskit_algorithms.optimizers import COBYLA
from qiskit_optimization import QuadraticProgram
from qiskit_optimization.applications import Tsp
from qiskit_optimization.converters import QuadraticProgramToQubo
from qiskit_optimization.minimum_eigensolvers import QAOA
from qiskit_optimization.translators import to_ising

from .config import QAOA_CONFIG, QAOAConfig


@dataclass
class QAOAResult:
    tour: list[int] | None
    bitstring: str
    counts: dict[str, int]
    layers: int
    qubits: int
    evaluations: int
    compute_ms: float


def create_graph(distance_matrix):
    """Build the weighted graph used by the earlier notebook examples."""
    distances = np.asarray(distance_matrix, dtype=float)
    n = len(distances)
    if distances.shape != (n, n):
        raise ValueError("Distance matrix must be square")
    graph = nx.complete_graph(n)
    for i, j in graph.edges:
        graph[i][j]["weight"] = distances[i, j]
    return graph


def create_hamiltonian(graph):
    """Build the full-city TSP Hamiltonian used by the earlier notebooks."""
    quadratic_program = Tsp(graph).to_quadratic_program()
    qubo = QuadraticProgramToQubo().convert(quadratic_program)
    return to_ising(qubo)


def _fixed_depot_hamiltonian(distances: np.ndarray) -> SparsePauliOp:
    """Encode only destination positions, with depot edges in the linear cost."""
    destinations = len(distances) - 1
    weights = distances / (float(distances.max()) or 1.0)
    problem = QuadraticProgram("Route with fixed departure")
    variables = [
        [f"x_{city}_{position}" for position in range(destinations)]
        for city in range(destinations)
    ]
    for row in variables:
        for variable in row:
            problem.binary_var(name=variable)

    linear = {}
    quadratic = {}
    for city, row in enumerate(variables):
        linear[row[0]] = float(weights[0, city + 1])
        linear[row[-1]] = linear.get(row[-1], 0.0) + float(weights[city + 1, 0])
    for position in range(destinations - 1):
        for first, row in enumerate(variables):
            for second, next_row in enumerate(variables):
                if first != second:
                    pair = row[position], next_row[position + 1]
                    quadratic[pair] = float(weights[first + 1, second + 1])

    problem.minimize(linear=linear, quadratic=quadratic)
    for city, row in enumerate(variables):
        problem.linear_constraint(dict.fromkeys(row, 1), "==", 1, f"city_{city}")
    for position, column in enumerate(zip(*variables)):
        problem.linear_constraint(dict.fromkeys(column, 1), "==", 1, f"position_{position}")

    qubo = QuadraticProgramToQubo(penalty=float(len(distances))).convert(problem)
    hamiltonian, _ = to_ising(qubo)
    return hamiltonian


def _permutation_mixer(destinations: int) -> QuantumCircuit:
    """Apply partial swaps between two cities at two visit positions."""
    exchange = np.zeros((16, 16), dtype=complex)
    exchange[9, 6] = exchange[6, 9] = 1  # |1001> <-> |0110>
    operator = SparsePauliOp.from_operator(Operator(exchange))
    mixer = QuantumCircuit(destinations * destinations)
    beta = Parameter("mix_beta")
    for first, second in combinations(range(destinations), 2):
        for left, right in combinations(range(destinations), 2):
            wires = [
                first * destinations + left,
                first * destinations + right,
                second * destinations + left,
                second * destinations + right,
            ]
            mixer.append(PauliEvolutionGate(operator, time=beta), wires)
    return mixer


def decode_tour(bitstring: str, destinations: int) -> list[int] | None:
    """Decode the sampled assignment and restore the depot at both ends."""
    if len(bitstring) != destinations * destinations or set(bitstring) - {"0", "1"}:
        return None
    assignment = np.array([int(bit) for bit in reversed(bitstring)])
    assignment = assignment.reshape(destinations, destinations)
    if not (np.all(assignment.sum(axis=0) == 1) and np.all(assignment.sum(axis=1) == 1)):
        return None
    order = (int(city) + 1 for city in assignment.argmax(axis=0))
    return [0, *order, 0]


def solve_qaoa(
    distance_matrix: list[list[float]],
    *,
    shots: int,
    beta: float,
    gamma: float,
    config: QAOAConfig = QAOA_CONFIG,
) -> QAOAResult:
    """Sample a closed tour, selecting the most frequent final measurement."""
    distances = np.asarray(distance_matrix, dtype=float)
    if distances.ndim != 2 or distances.shape[0] != distances.shape[1] or len(distances) < 2:
        raise ValueError("Expected a square distance matrix with a depot and at least one destination")

    destinations = len(distances) - 1
    qubits = destinations * destinations
    initial_state = QuantumCircuit(qubits)
    for position in range(destinations):
        initial_state.x((destinations - 1 - position) * destinations + position)

    backend = AerSimulator(max_parallel_threads=config.max_parallel_threads)
    layers = 0
    evaluations = 0
    optimization_ms = 0.0
    circuit = initial_state
    if destinations > 1:
        layers = config.layers
        hamiltonian = _fixed_depot_hamiltonian(distances)
        sampler = SamplerV2(
            default_shots=shots,
            seed=config.seed,
            options={"backend_options": {"max_parallel_threads": config.max_parallel_threads}},
        )

        def record_evaluation(*_):
            nonlocal evaluations
            evaluations += 1

        qaoa = QAOA(
            sampler=sampler,
            optimizer=COBYLA(maxiter=config.max_evaluations, tol=config.tolerance),
            reps=layers,
            initial_state=initial_state,
            mixer=_permutation_mixer(destinations),
            aggregation=config.cvar_alpha,
            pass_manager=generate_preset_pass_manager(backend=backend, optimization_level=1),
            initial_point=np.r_[np.full(layers, beta), np.full(layers, gamma)],
            callback=record_evaluation,
        )
        started = perf_counter()
        optimum = qaoa.compute_minimum_eigenvalue(hamiltonian)
        optimization_ms = (perf_counter() - started) * 1000

    started = perf_counter()
    if layers:
        circuit = qaoa.ansatz.remove_final_measurements(inplace=False)
        circuit = circuit.assign_parameters(optimum.optimal_point)
    # A single destination has one feasible assignment, so sample the initial X state.
    circuit.measure_all()
    compiled = transpile(circuit, backend, seed_transpiler=config.seed)
    counts = backend.run(compiled, shots=shots, seed_simulator=config.seed).result().get_counts()
    bitstring = max(counts, key=counts.get, default="")
    tour = decode_tour(bitstring, destinations)
    compute_ms = optimization_ms + (perf_counter() - started) * 1000
    return QAOAResult(tour, bitstring, counts, layers, qubits, evaluations, compute_ms)
