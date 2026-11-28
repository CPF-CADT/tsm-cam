"""Default settings for the route optimizer's QAOA experiment."""

from dataclasses import dataclass


@dataclass(frozen=True)
class QAOAConfig:
    layers: int = 3
    # 1.0 averages all measured energies. 0.75 uses the lowest-energy 75%.
    cvar_alpha: float = 1.0
    initial_beta: float = 0.4
    initial_gamma: float = 1.0
    shots: int = 1024
    max_evaluations: int = 250
    tolerance: float = 1e-4
    seed: int = 42
    max_parallel_threads: int = 4


QAOA_CONFIG = QAOAConfig()
