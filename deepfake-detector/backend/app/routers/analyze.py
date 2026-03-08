from __future__ import annotations

import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import settings
from app.models.schemas import FileAnalysisResponse
from app.services import inference as inference_service
from app.services import session_manager
from app.services.file_analyzer import analyze_file
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1")

SUPPORTED_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/ogg",
    "audio/flac",
    "audio/webm",
    "video/mp4",
    "video/webm",
}


@router.post("/analyze", response_model=FileAnalysisResponse)
async def analyze_audio_file(
    file: UploadFile = File(...),
    session_id: str = Form(None),
):
    if not inference_service.is_ready():
        raise HTTPException(
            status_code=503,
            detail={"code": "MODEL_UNAVAILABLE", "message": "Model not loaded"},
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_AUDIO", "message": "Empty file"},
        )

    try:
        result = await analyze_file(
            file_bytes,
            file.content_type or "audio/wav",
            file.filename or "upload",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_AUDIO", "message": str(e)},
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "ANALYSIS_FAILED", "message": str(e)},
        )

    # Attach or create session
    session = None
    if session_id:
        session = session_manager.get_session(session_id)
    if session is None:
        session = session_manager.create_session("file", "web")
    result["session_id"] = session.session_id

    # ── Secondary analysis layer ──────────────────────────────────────────────
    # Buffer PCM for calls that aren't clearly fake (score < fake threshold).
    secondary_result: dict | None = None
    avg_score = result["overall"]["avg_score"]
    pcm_bytes: bytes = result.pop("pcm_bytes", b"")

    if settings.secondary_enabled and avg_score < settings.threshold_fake_min and pcm_bytes:
        session.append_to_secondary_buffer(pcm_bytes)
        logger.info(
            "REST: buffered %d PCM bytes for session=%s (buffer total=%d bytes, %.1fs)",
            len(pcm_bytes),
            session.session_id,
            len(session.secondary_audio_buffer),
            len(session.secondary_audio_buffer) / (settings.sample_rate * 2),
        )

        if session.should_trigger_secondary() and not session.secondary_analysis_running:
            from app.services import secondary_analyzer
            session.secondary_analysis_running = True
            buffer = session.secondary_audio_buffer
            session.secondary_audio_buffer = b""
            session.secondary_buffer_start = None
            try:
                secondary_result = await secondary_analyzer.run_secondary_analysis(buffer)
                session.secondary_results.append(secondary_result)
                logger.info(
                    "REST secondary analysis complete — session=%s urgency=%s",
                    session.session_id,
                    secondary_result["urgency_level"],
                )
            except Exception as exc:
                logger.error("REST secondary analysis failed for session=%s: %s", session.session_id, exc)
            finally:
                session.secondary_analysis_running = False
    else:
        session.reset_secondary_buffer()

    # If a secondary result wasn't just produced, surface the most recent one from this session
    if secondary_result is None and session.secondary_results:
        secondary_result = session.secondary_results[-1]

    if secondary_result:
        result["secondary_result"] = {
            "transcript": secondary_result["transcript"],
            "urgency_level": secondary_result["urgency_level"],
            "confidence_score": secondary_result["confidence_score"],
            "reasoning": secondary_result["reasoning"],
            "latency_ms": secondary_result["latency_ms"],
        }

    return FileAnalysisResponse(**result)
