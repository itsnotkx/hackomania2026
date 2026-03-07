import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture
def mock_inference():
    """Mock the inference module so tests don't need the actual ML model."""
    with patch("app.services.inference._model_ready", True), \
         patch("app.services.inference.run_inference") as mock_run:
        mock_run.return_value = {
            "score": 0.15,
            "label": "likely_real",
            "confidence": 0.92,
            "latency_ms": 150,
        }
        yield mock_run


@pytest.fixture
def client(mock_inference):
    from app.main import app
    with TestClient(app) as c:
        yield c
