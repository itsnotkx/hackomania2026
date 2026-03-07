from fastapi.testclient import TestClient
from unittest.mock import patch


def test_health_model_ready():
    with patch("app.services.inference._model_ready", True):
        from app.main import app
        with TestClient(app) as client:
            r = client.get("/health")
            assert r.status_code == 200
            data = r.json()
            assert data["model_loaded"] is True
            assert data["status"] == "ok"
            assert "version" in data


def test_health_model_loading():
    with patch("app.services.inference._model_ready", False):
        from app.main import app
        with TestClient(app) as client:
            r = client.get("/health")
            assert r.status_code == 200
            data = r.json()
            assert data["model_loaded"] is False
            assert data["status"] == "loading"
