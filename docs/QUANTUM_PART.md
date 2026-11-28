# Quantum route optimization

The web app and the CVaR comparison notebook use the same fixed-depot TSP
workflow. Given a Haversine distance matrix, the app returns a closed tour
through one to three destinations.

## Solver flow

1. Build a quadratic program with one binary variable for each destination and
   visit position. Add the depot-to-first-stop and last-stop-to-depot distances
   to the objective. Convert the program to a QUBO and then to an Ising
   Hamiltonian.
2. Prepare the reverse input order as an initial feasible tour. With three
   destinations, the encoding uses nine qubits.
3. Alternate the cost operation and a permutation-swap mixer. The mixer
   exchanges two cities across two positions while preserving valid assignments.
   COBYLA tunes the circuit angles using the configured energy aggregation.
4. Run the optimized circuit on Aer and take the highest-frequency final
   bitstring. Reverse its bit order for decoding and check the one-hot
   assignment before adding the depot at both ends of the tour.
5. For a single destination, measure the one-qubit assignment directly. The
   API reports zero QAOA layers and zero objective evaluations for this case.

Classical mode independently uses Held–Karp dynamic programming to find the
exact minimum tour.

## Configuration and monitoring

Edit [app/quantum/config.py](../app/quantum/config.py) to change the QAOA defaults.

| Setting | Default |
| --- | ---: |
| QAOA layers | 3 |
| CVaR alpha | 1.0 |
| Initial beta and gamma | 0.4 and 1.0 |
| Shots per evaluation and final measurement | 1,024 |
| COBYLA evaluation budget | 250 |
| Simulator seed | 42 |

Alpha 1.0 averages all sampled energies. Set it to 0.75 to average the
lowest-energy 75%. Existing API callers can override the initial angles and shot
count through the request body.

The API returns the selected bitstring, actual final measurement counts, and
effective run metadata. Quantum compute time includes angle tuning, final
compilation, sampling and decoding. Held–Karp compute time covers the search and
tour reconstruction. Geocoding, distance-matrix construction and total server
processing are reported separately.

## References

- [Hadfield et al. (2019), Section 5.1](https://www.mdpi.com/1999-4893/12/2/34) describes permutation-swap mixers for TSP.
- [Barkoutsos et al. (2020)](https://quantum-journal.org/papers/q-2020-04-20-256/) describes CVaR aggregation for variational optimization.
