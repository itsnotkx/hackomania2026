import io
import wave
import pytest
import numpy as np
from fastapi.testclient import TestClient
from unittest.mock import patch


def make_wav_bytes(duration_s: float = 2.0, sample_rate: int = 16000) -> bytes:
    """Create a minimal WAV file in memory."""
    samples = int(duration_s * sample_rate)
    data = (np.zeros(samples, dtype=np.int16)).tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(data)
    return buf.getvalue()


def make_mp3_bytes() -> bytes:
    """Create a minimal valid MP3 file (silent, ID3v2 + single frame)."""
    # ID3v2 header (10 bytes, no tags)
    id3 = b"ID3\x03\x00\x00\x00\x00\x00\x00"
    # A single valid MP3 frame: 128kbps, 44100Hz, stereo, silence
    # Header: 0xFFFB9000 + 417 bytes of zeros
    frame_header = bytes([0xFF, 0xFB, 0x90, 0x00])
    frame_body = b"\x00" * 413
    return id3 + frame_header + frame_body


AUDIO_FORMATS = [
    ("test.wav",  make_wav_bytes,  "audio/wav"),
    ("test.mp3",  make_mp3_bytes,  "audio/mpeg"),
]


MOCK_RESULT = {
    "score": 0.15,
    "label": "likely_real",
    "confidence": 0.92,
    "latency_ms": 150,
}

EXPECTED_VERDICTS = {"likely_real", "uncertain", "likely_fake"}


def _assert_valid_response(data: dict) -> None:
    assert "session_id" in data
    assert "segments" in data
    assert "overall" in data
    assert data["overall"]["verdict"] in EXPECTED_VERDICTS


@pytest.mark.parametrize("filename,make_bytes,content_type", AUDIO_FORMATS)
def test_analyze_audio_formats(filename, make_bytes, content_type):
    with patch("app.services.inference._model_ready", True), \
         patch("app.services.inference.run_inference", return_value=MOCK_RESULT), \
         patch("app.services.file_analyzer._load_audio_bytes",
               return_value=np.zeros(32000, dtype=np.float32)):
        from app.main import app
        with TestClient(app) as client:
            r = client.post(
                "/api/v1/analyze",
                files={"file": (filename, make_bytes(), content_type)},
            )
            assert r.status_code == 200, r.text
            _assert_valid_response(r.json())
