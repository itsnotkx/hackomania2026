from __future__ import annotations

import numpy as np

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)


def decode_pcm(audio_bytes: bytes) -> np.ndarray:
    """Decode raw int16 PCM bytes to float32 numpy array normalized to [-1, 1]."""
    return np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0


def validate_chunk(audio_bytes: bytes) -> tuple[bool, str]:
    """
    Validate incoming audio chunk.
    Returns (is_valid, error_message).
    Accept any chunk up to max_chunk_duration_ms. Empty chunks are rejected.
    """
    if len(audio_bytes) == 0:
        return False, "Empty audio chunk"
    max_bytes = settings.sample_rate * (settings.max_chunk_duration_ms / 1000) * 2  # int16 = 2 bytes
    if len(audio_bytes) > max_bytes:
        return False, f"Audio chunk too long — max {settings.max_chunk_duration_ms}ms"
    return True, ""
