import json
import numpy as np
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


def test_websocket_binary_frame():
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
            # Create session first
            r = client.post("/api/v1/sessions", json={
                "source_type": "call",
                "client_platform": "desktop",
            })
            session_id = r.json()["session_id"]

            # Send WebSocket frame
            silence = bytes(64000)
            with client.websocket_connect(f"/ws/v1/stream/{session_id}") as ws:
                ws.send_bytes(silence)
                response = ws.receive_json()
                assert response["type"] == "result"
                assert "score" in response
                assert "label" in response
                assert "rolling_avg" in response


def test_websocket_invalid_session():
    with patch("app.services.inference._model_ready", True):
        from app.main import app
        with TestClient(app) as client:
            with client.websocket_connect("/ws/v1/stream/sess_invalid") as ws:
                # Server should close immediately
                pass
