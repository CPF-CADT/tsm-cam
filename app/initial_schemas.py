from typing import Literal

from pydantic import BaseModel, Field


class PickedPoint(BaseModel):
    query: str = Field(min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteRequest(BaseModel):
    depot: str = Field(min_length=2)
    destinations: list[str] = Field(min_length=1, max_length=3)
    profile: Literal["driving"] = "driving"
    gamma: float = Field(default=0.2, gt=0)
    beta: float = Field(default=0.2, gt=0)
    shots: int = Field(default=32768, ge=1024, le=65536)
    solver_mode: Literal["quantum", "classical"] = "quantum"
    depot_point: PickedPoint | None = None
    destination_points: list[PickedPoint | None] = Field(default_factory=list, max_length=3)


class GeocodeResult(BaseModel):
    query: str
    display_name: str
    latitude: float
    longitude: float
    osm_type: str | None = None
    osm_id: int | None = None
    detected_type: str | None = None
    province: str | None = None


class RouteResponse(BaseModel):
    status: str
    solver: str
    message: str
    locations: list[GeocodeResult]
    order: list[int]
    ordered_names: list[str]
    distance_meters: float | None = None
    duration_seconds: float | None = None
    geometry: dict | None = None
    legs: list[dict] = Field(default_factory=list)
    repeated_segments: list[str] = Field(default_factory=list)
    boundary_violation: bool = False
    selected_bitstring: str | None = None
    top_measurements: dict[str, int] = Field(default_factory=dict)
    validation_enabled: bool = False
    winner: Literal["quantum", "classical", "tie"] = "quantum"
    quantum_ordered_names: list[str] = Field(default_factory=list)
    quantum_distance_meters: float | None = None
    quantum_repeated_segments: list[str] = Field(default_factory=list)
    quantum_bitstring: str | None = None
    classical_ordered_names: list[str] = Field(default_factory=list)
    classical_distance_meters: float | None = None
    classical_repeated_segments: list[str] = Field(default_factory=list)
