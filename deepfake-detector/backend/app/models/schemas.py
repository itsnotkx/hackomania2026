from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel

from app.models.enums import ClientPlatform, Label, SourceType


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str


class SessionCreateRequest(BaseModel):
    source_type: SourceType
    client_platform: ClientPlatform
    metadata: Optional[dict[str, Any]] = None


class SessionConfig(BaseModel):
    sample_rate: int
    chunk_duration_ms: int
    chunk_bytes: int
    rolling_window_size: int


class SessionCreateResponse(BaseModel):
    session_id: str
    created_at: datetime
    config: SessionConfig


class DetectionResult(BaseModel):
    type: Literal["result"] = "result"
    seq: int
    score: float
    label: Label
    confidence: float
    rolling_avg: float
    latency_ms: int


class ErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str


class SessionSummary(BaseModel):
    total_chunks: int
    avg_score: float
    peak_score: float
    verdict: Label
    duration_s: float


class SessionDeleteResponse(BaseModel):
    session_id: str
    summary: SessionSummary


class ChunkHistory(BaseModel):
    seq: int
    timestamp_ms: int
    score: float
    label: Label
    confidence: float


class SessionHistoryResponse(BaseModel):
    session_id: str
    chunks: list[ChunkHistory]
    has_more: bool
    next_seq: Optional[int] = None


class ThresholdConfig(BaseModel):
    likely_real_max: float
    likely_fake_min: float


class ConfigResponse(BaseModel):
    model_name: str
    thresholds: dict[str, float]
    rolling_window_size: int
    supported_sample_rates: list[int]
    max_chunk_duration_ms: int
    supported_formats: list[str]


class FileSegment(BaseModel):
    start_s: float
    end_s: float
    score: float
    label: Label


class FileAnalysisOverall(BaseModel):
    avg_score: float
    peak_score: float
    verdict: Label
    fake_segment_ratio: float


class FileAnalysisResponse(BaseModel):
    session_id: str
    file_name: str
    duration_s: float
    segments: list[FileSegment]
    overall: FileAnalysisOverall
