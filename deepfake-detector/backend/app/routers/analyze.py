from __future__ import annotations

import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.schemas import FileAnalysisResponse
from app.services import inference as inference_service
from app.services import session_manager
from app.services.file_analyzer import analyze_file

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

    result = await analyze_file(
        file_bytes,
        file.content_type or "audio/wav",
        file.filename or "upload",
    )

    # Attach or create session
    if session_id and session_manager.get_session(session_id):
        result["session_id"] = session_id
    else:
        sess = session_manager.create_session("file", "web")
        result["session_id"] = sess.session_id

    return FileAnalysisResponse(**result)
