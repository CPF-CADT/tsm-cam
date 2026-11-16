"""Classical distance features used to build the optimization weights."""

from .locations import (
    EARTH_RADIUS_KM,
    build_distance_matrix,
    build_straight_distance_matrix,
)

__all__ = [
    "EARTH_RADIUS_KM",
    "build_distance_matrix",
    "build_straight_distance_matrix",
]
