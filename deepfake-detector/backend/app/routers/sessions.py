from __future__ import annotations

import datetime

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.models.schemas import (
    ChunkHistory,
    SessionConfig,
    SessionCreateRequest,
    SessionCreateResponse,
    SessionDeleteResponse,
    SessionHistoryResponse,
)
from app.services import session_manager

router = APIRouter(prefix="/api/v1")


@router.post("/sessions", response_model=SessionCreateResponse, status_code=201)
async def create_session(req: SessionCreateRequest):
    session = session_manager.create_session(
        source_type=req.source_type.value,
        client_platform=req.client_platform.value,
    )
    created_at = datetime.datetime.utcfromtimestamp(session.created_at).replace(
        tzinfo=datetime.timezone.utc
    )
    return SessionCreateResponse(
        session_id=session.session_id,
        created_at=created_at,
        config=SessionConfig(
            sample_rate=settings.sample_rate,
            chunk_duration_ms=settings.chunk_duration_ms,
            chunk_bytes=settings.chunk_bytes,
            rolling_window_size=settings.rolling_window_size,
        ),
    )


@router.delete("/sessions/{session_id}", response_model=SessionDeleteResponse)
async def delete_session(session_id: str):
    session = session_manager.delete_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "SESSION_NOT_FOUND", "message": "Session not found"},
        )
    return SessionDeleteResponse(session_id=session_id, summary=session.get_summary())


@router.get("/sessions/{session_id}/history", response_model=SessionHistoryResponse)
async def get_session_history(session_id: str, from_seq: int = 0, limit: int = 50):
    session = session_manager.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "SESSION_NOT_FOUND", "message": "Session not found"},
        )
    limit = min(limit, 200)
    chunks = [c for c in session.chunks if c["seq"] >= from_seq]
    page = chunks[:limit]
    has_more = len(chunks) > limit
    next_seq = page[-1]["seq"] + 1 if has_more and page else from_seq
    return SessionHistoryResponse(
        session_id=session_id,
        chunks=[ChunkHistory(**c) for c in page],
        has_more=has_more,
        next_seq=next_seq,
    )
