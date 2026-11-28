# Classical route optimization

Held–Karp computes the exact shortest round trip for the app's distance matrix. Every tour starts at the depot, visits each selected destination once, and returns to the depot.

## Shared inputs and route output

1. [FastAPI](../app/main.py) resolves typed locations or uses coordinates already picked on either map. `TSM_OFFLINE=1` uses the [local place index](../app/classical/places.py).
2. [Distance preparation](../app/classical/locations.py) calculates pairwise Haversine distances in kilometers. The comparison endpoint sends the same matrix to Held–Karp and QAOA.
3. [Route formatting](../app/classical/routes.py) converts each visit order into straight GeoJSON lines. The API reports distance in meters and estimates flight time in seconds using a constant cruise speed of 252 km/h. The browser formats that estimate in hours and minutes.

## How Held–Karp works

[held_karp.py](../app/classical/held_karp.py) stores the cheapest partial route for each combination of **visited destinations** and **last stop**. It adds the return leg to the depot and reconstructs the best tour using the stored predecessors. For `n` destinations, the algorithm takes `O(n² · 2ⁿ)` time and `O(n · 2ⁿ)` space.

The **Held–Karp compute** time covers the search and route reconstruction. The comparison API reports geocoding, distance-matrix construction and total server processing separately. It also reports the percentage by which QAOA's tour length exceeds the exact minimum when both solvers succeed and the percentage is defined.

Because Haversine distances are symmetric, a round trip can travel in either direction with the same total length. The two maps can therefore show different visit orders with a 0% distance gap.

[Project structure](PROJECT_STRUCTURE.md) · [Quantum solver](QUANTUM_PART.md)
