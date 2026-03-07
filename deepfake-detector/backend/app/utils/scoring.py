from __future__ import annotations

from app.config import settings
from app.models.enums import Label


def score_to_label(score: float) -> Label:
    if score < settings.threshold_real_max:
        return Label.LIKELY_REAL
    if score < settings.threshold_fake_min:
        return Label.UNCERTAIN
    return Label.LIKELY_FAKE


def rolling_average(scores: list[float], window: int | None = None) -> float:
    if not scores:
        return 0.0
    w = window or settings.rolling_window_size
    return round(sum(scores[-w:]) / min(len(scores), w), 4)
