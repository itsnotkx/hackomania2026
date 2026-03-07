import io
import wave
import struct
import numpy as np
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock


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


def test_analyze_wav_file():
    mock_result = {
        "score": 0.15,
        "label": "likely_real",
        "confidence": 0.92,
        "latency_ms": 150,
    }
    with patch("app.services.inference._model_ready", True), \
         patch("app.services.inference.run_inference", return_value=mock_result):
        from app.main import app
        with TestClient(app) as client:
            wav_bytes = make_wav_bytes()
            r = client.post(
                "/api/v1/analyze",
                files={"file": ("test.wav", wav_bytes, "audio/wav")},
            )
            assert r.status_code == 200
            data = r.json()
            assert "session_id" in data
            assert "segments" in data
            assert "overall" in data
            assert data["overall"]["verdict"] in ["likely_real", "uncertain", "likely_fake"]
