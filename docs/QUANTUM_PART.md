# Quantum route optimization

The app runs QAOA in Qiskit Aer to find a round trip through the same stops used by [Held–Karp](CLASSICAL_PART.md). [qaoa.py](../app/quantum/qaoa.py) implements the fixed-depot workflow illustrated in the [comparison notebook](../TSM_CAM_QAOA_CVaR_HEL_KARB.ipynb).

## Solver flow

1. Encode the destination-to-position assignment as a quadratic program. Include the first and last depot legs in the cost. Convert the program to a QUBO and then an Ising Hamiltonian. With `n` destinations, the assignment uses `n²` qubits.
2. Prepare the reverse input order as a valid starting tour. Alternate the cost operator and a permutation-swap mixer that preserves valid assignments. COBYLA tunes the mixer and cost angles using the configured CVaR objective.
3. Sample the optimized circuit and select the highest-frequency bitstring. Reverse its displayed bit order to build the one-hot assignment matrix, validate it, and add the depot to both ends of the visit order. The comparison panel shows an error if that bitstring encodes an invalid tour.
4. For a single destination, sample the only valid assignment on one qubit. The API reports zero QAOA layers and zero objective evaluations for this case.

## Defaults

Change these in [config.py](../app/quantum/config.py).

| Setting | Default |
| --- | ---: |
| QAOA layers | 3 |
| CVaR alpha | 1.0 |
| Initial beta / gamma | 0.4 / 1.0 |
| Shots per objective evaluation and final measurement | 1,024 |
| Maximum COBYLA evaluations | 250 |
| Simulator seed | 42 |

Alpha `1.0` averages all sampled energies. Alpha `0.75` averages the lowest-energy 75%. The API accepts initial-angle and shot-count overrides through `beta`, `gamma` and `shots`.

## Results and timing

Each Quantum panel shows the solver's compute time, circuit size, selected bitstring, shot count and CVaR settings. The API also returns the top ten final measurement counts. Quantum compute time includes angle tuning, final circuit compilation, sampling and decoding.

The server caches up to 64 successful runs using the distance matrix and solver settings as the key. A hit displays **Cached result** and reuses the recorded measurements. Restarting the server clears the cache. For a fresh run, add `"fresh_quantum": true` to the JSON body sent to `POST /api/routes/compare`.

```bash
curl -sS http://127.0.0.1:8000/api/routes/compare \
  -H 'Content-Type: application/json' \
  -d '{"depot":"Phnom Penh","destinations":["Takeo","Kampong Cham","Siem Reap"],"left_solver":"classical","right_solver":"quantum","fresh_quantum":true}'
```

## References

- [Hadfield et al. (2019), §5.1](https://www.mdpi.com/1999-4893/12/2/34) describes permutation-swap mixers for TSP.
- [Barkoutsos et al. (2020)](https://quantum-journal.org/papers/q-2020-04-20-256/) describes CVaR for variational optimization.
