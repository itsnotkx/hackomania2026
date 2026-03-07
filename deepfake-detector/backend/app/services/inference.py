from __future__ import annotations

import time

import numpy as np
import torch

from app.config import settings
from app.utils.logging import get_logger
from app.models.nii_deepfake import load_nii_model, preprocess_audio, DeepfakeDetector

logger = get_logger(__name__)

_model: DeepfakeDetector | None = None
_device: torch.device = None
_model_ready = False


def load_model() -> None:
    global _model, _device, _model_ready
    
    # Set device (GPU if available)
    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Using device: %s", _device)
    
    logger.info("Loading NII AntiDeepfake model: %s", settings.model_id)
    _model = load_nii_model(settings.model_id)
    _model.to(_device)
    _model.eval()

    # Warmup dummy inference — triggers JIT, so first real request is not cold
    logger.info("Running warmup inference...")
    dummy = np.zeros(settings.sample_rate * 2, dtype=np.float32)  # 2s silence
    dummy_tensor = preprocess_audio(dummy).to(_device)
    with torch.no_grad():
        _model(dummy_tensor, _device)

    _model_ready = True
    logger.info("NII AntiDeepfake model loaded and warmed: %s", settings.model_id)


def is_ready() -> bool:
    return _model_ready


def run_inference(audio_bytes: bytes) -> dict:
    """
    Accepts raw int16 PCM bytes (16kHz mono).
    Returns {"score": float, "label": str, "confidence": float, "latency_ms": int}.

    IMPORTANT: Call via asyncio.to_thread(run_inference, data) — never call directly from async context.
    
    NII Model output: logits [fake_score, real_score]
    - Index 0 = Fake/AI probability
    - Index 1 = Real/Human probability
    """
    t0 = time.perf_counter()

    # Decode int16 PCM
    audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0

    # Preprocess for NII model (applies layer normalization)
    audio_tensor = preprocess_audio(audio_np).to(_device)
    
    with torch.no_grad():
        logits = _model(audio_tensor, _device)

    probs = torch.softmax(logits, dim=-1)[0]
    
    # NII model: Index 0 = Fake, Index 1 = Real
    # We want score to represent "AI/fake probability" for consistency
    score = probs[0].item()  # Fake probability
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
