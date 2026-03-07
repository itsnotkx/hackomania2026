# NoScam Backend

FastAPI inference service for real-time AI audio detection.

## Architecture

- **Model**: `HoangHa/wav2vec2-large-xlsr-53-fake-audio-detection` (Wav2Vec2-based classifier)
- **Input**: Raw int16 PCM audio at 16kHz, mono
- **Output**: `{score: 0.0-1.0, label: "likely_real"|"uncertain"|"likely_fake", confidence, rolling_avg}`

## API

See [`api-contract.md`](../../api-contract.md) for full spec.

Key endpoints:
- `GET /health` — Model readiness check
- `POST /api/v1/sessions` — Create detection session
- `WS /ws/v1/stream/{session_id}` — Real-time audio streaming
- `POST /api/v1/analyze` — File upload (one-shot analysis)
- `GET /api/v1/config` — Current thresholds

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Start server (model downloads on first run, ~60-90s)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Run tests (mocked — no model needed)
pip install pytest pytest-asyncio httpx
pytest tests/
```

## Docker

```bash
# Build
docker build -t noscam-backend .

# Run
docker run -p 8000:8000 noscam-backend

# Or use docker-compose (includes HuggingFace cache volume)
docker-compose up
```

## Deployment (Railway)

1. Push to GitHub
2. In Railway dashboard: New Project -> Deploy from GitHub
3. Set **Root Directory** to `deepfake-detector/backend`
4. Railway auto-detects Dockerfile and deploys
5. Wait 2-3 minutes for model download on first deploy
6. Verify: `curl https://YOUR-RAILWAY-URL/health`

## Critical Constraints

- `--workers 1` is mandatory — multi-worker loads model N times, exceeds Railway 512MB RAM
- `numpy<2.0` — numpy 2.0 breaks torchaudio silently
- Inference MUST run via `asyncio.to_thread()` — never directly on the event loop
