from fastapi.testclient import TestClient
from unittest.mock import patch


def test_create_and_delete_session():
    with patch("app.services.inference._model_ready", True):
        from app.main import app
        with TestClient(app) as client:
            # Create
            r = client.post("/api/v1/sessions", json={
                "source_type": "call",
                "client_platform": "desktop",
            })
            assert r.status_code == 201
            data = r.json()
            assert "session_id" in data
            session_id = data["session_id"]
            assert data["config"]["sample_rate"] == 16000

            # Delete
            r = client.delete(f"/api/v1/sessions/{session_id}")
            assert r.status_code == 200
            assert r.json()["session_id"] == session_id


def test_delete_nonexistent_session():
    with patch("app.services.inference._model_ready", True):
        from app.main import app
        with TestClient(app) as client:
            r = client.delete("/api/v1/sessions/sess_doesnotexist")
            assert r.status_code == 404
