FROM python:3.11-slim

WORKDIR /app

# System dependencies required by torchaudio (libsndfile1) and audio processing (ffmpeg)
# Both are required — missing libsndfile1 causes silent torchaudio failures
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# torch 2.3 download is ~800MB, cached after first build
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code AFTER requirements to maximize layer cache hits
COPY . .

# Single worker is mandatory: multiple workers load Wav2Vec2 (~450MB) independently,
# exceeding Railway's 512MB RAM limit
# PORT env var is provided automatically by Railway
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
