"""Exact closed-tour optimization using Held–Karp dynamic programming."""


def held_karp_tour(distances: list[list[float]]) -> list[int]:
    """Return a minimum-distance tour starting and ending at depot index 0."""
    destinations = range(1, len(distances))
    bits = {stop: 1 << (stop - 1) for stop in destinations}
    all_visited = (1 << len(destinations)) - 1

    # Each state maps (visited destinations, last stop) to (cost, previous stop).
    best = {(bits[stop], stop): (distances[0][stop], 0) for stop in destinations}
    for visited in range(1, all_visited + 1):
        stops = [stop for stop in destinations if visited & bits[stop]]
        for last in stops:
            previous_visited = visited ^ bits[last]
            if previous_visited:
                best[visited, last] = min(
                    (best[previous_visited, previous][0] + distances[previous][last], previous)
                    for previous in stops
                    if previous != last
                )

    last = min(destinations, key=lambda stop: best[all_visited, stop][0] + distances[stop][0])
    visited = all_visited
    reversed_order = []
    while visited:
        reversed_order.append(last)
        previous = best[visited, last][1]
        visited ^= bits[last]
        last = previous

    return [0, *reversed(reversed_order), 0]
