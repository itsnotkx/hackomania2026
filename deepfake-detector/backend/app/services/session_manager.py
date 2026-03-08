from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)


@dataclass
class Session:
    session_id: str
    source_type: str
    client_platform: str
    created_at: float = field(default_factory=time.time)
    chunks: list[dict] = field(default_factory=list)  # list of {seq, timestamp_ms, score, label, confidence}
    chunk_count: int = 0
    rolling_scores: list[float] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)
    paused: bool = False

    # Secondary analysis state
    secondary_audio_buffer: bytes = b""
    secondary_buffer_start: float | None = None
    secondary_analysis_running: bool = False
    secondary_results: list[dict] = field(default_factory=list)
    uncertain_streak: int = 0

    def add_result(self, seq: int, score: float, label: str, confidence: float) -> None:
        timestamp_ms = round((time.time() - self.start_time) * 1000)
        self.chunks.append({
            "seq": seq,
            "timestamp_ms": timestamp_ms,
            "score": round(score, 4),
            "label": label,
            "confidence": round(confidence, 4),
        })
        self.rolling_scores.append(score)
        self.chunk_count += 1

    def append_to_secondary_buffer(self, audio_bytes: bytes) -> None:
        """Append PCM audio to the secondary analysis buffer."""
        if self.secondary_buffer_start is None:
            self.secondary_buffer_start = time.time()
        self.secondary_audio_buffer += audio_bytes
        self.uncertain_streak += 1

    def should_trigger_secondary(self) -> bool:
        """Check if enough uncertain audio has accumulated to trigger secondary analysis."""
        if self.secondary_analysis_running:
            return False
        if self.secondary_buffer_start is None:
            return False
        elapsed = time.time() - self.secondary_buffer_start
        return elapsed >= settings.secondary_buffer_duration_s

    def reset_secondary_buffer(self) -> None:
        """Clear the secondary buffer when detection becomes certain."""
        self.secondary_audio_buffer = b""
        self.secondary_buffer_start = None
        self.uncertain_streak = 0

    def get_summary(self) -> dict:
        scores = [c["score"] for c in self.chunks]
        avg = round(sum(scores) / len(scores), 4) if scores else 0.0
        peak = round(max(scores), 4) if scores else 0.0
        duration_s = round(time.time() - self.start_time, 1)
        from app.utils.scoring import score_to_label
        verdict = score_to_label(avg).value
        return {
            "total_chunks": self.chunk_count,
            "avg_score": avg,
            "peak_score": peak,
            "verdict": verdict,
            "duration_s": duration_s,
        }


_sessions: dict[str, Session] = {}


def create_session(source_type: str, client_platform: str) -> Session:
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    session = Session(session_id=session_id, source_type=source_type, client_platform=client_platform)
    _sessions[session_id] = session
    logger.info("Created session %s (%s/%s)", session_id, source_type, client_platform)
    return session


def get_session(session_id: str) -> Session | None:
    return _sessions.get(session_id)


def delete_session(session_id: str) -> Session | None:
    session = _sessions.pop(session_id, None)
    if session:
        logger.info("Deleted session %s", session_id)
    return session
