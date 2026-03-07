from __future__ import annotations

from fastapi import APIRouter

from app.config import settings
from app.models.schemas import ConfigResponse

router = APIRouter(prefix="/api/v1")


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    return ConfigResponse(
        model_name=settings.model_id,
        thresholds={
            "real_max": settings.threshold_real_max,
            "fake_min": settings.threshold_fake_min,
        },
        rolling_window_size=settings.rolling_window_size,
        supported_sample_rates=[8000, 16000, 44100],
        max_chunk_duration_ms=settings.max_chunk_duration_ms,
        supported_formats=["pcm_s16le", "wav", "mp3", "ogg", "webm"],
    )
