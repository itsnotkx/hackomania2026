from __future__ import annotations

import time

import numpy as np
import torch
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

_processor = None
_model = None
_model_ready = False


def load_model() -> None:
    global _processor, _model, _model_ready
    logger.info("Loading model: %s", settings.model_id)
    _processor = AutoFeatureExtractor.from_pretrained(settings.model_id)
    _model = AutoModelForAudioClassification.from_pretrained(settings.model_id)
    _model.eval()

    # Warmup dummy inference — triggers JIT, so first real request is not cold
    logger.info("Running warmup inference...")
    dummy = np.zeros(settings.sample_rate * 2, dtype=np.float32)  # 2s silence
    inputs = _processor(dummy, sampling_rate=settings.sample_rate, return_tensors="pt")
    with torch.no_grad():
        _model(**inputs)

    _model_ready = True
    logger.info("Model loaded and warmed: %s", settings.model_id)


def is_ready() -> bool:
    return _model_ready


def run_inference(audio_bytes: bytes) -> dict:
    """
    Accepts raw int16 PCM bytes (16kHz mono).
    Returns {"score": float, "label": str, "confidence": float, "latency_ms": int}.

    IMPORTANT: Call via asyncio.to_thread(run_inference, data) — never call directly from async context.
    """
    t0 = time.perf_counter()

    # Decode int16 PCM
    audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0

    inputs = _processor(audio_np, sampling_rate=settings.sample_rate, return_tensors="pt")
    with torch.no_grad():
        logits = _model(**inputs).logits

    probs = torch.softmax(logits, dim=-1)[0]
    # Index 1 = AI/fake class
    score = probs[1].item()
    confidence = float(probs.max().item())

    latency_ms = round((time.perf_counter() - t0) * 1000)

    from app.utils.scoring import score_to_label

    label = score_to_label(score)

    return {
        "score": round(score, 4),
        "label": label.value,
        "confidence": round(confidence, 4),
        "latency_ms": latency_ms,
    }
