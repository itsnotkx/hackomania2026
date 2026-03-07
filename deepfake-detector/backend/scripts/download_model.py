"""
Pre-download the Wav2Vec2 model to HuggingFace cache.
Run this inside the Docker build or before first startup to avoid cold-start delay.

Usage: python scripts/download_model.py
"""
import os
import sys

MODEL_ID = os.getenv("MODEL_ID", "HoangHa/wav2vec2-large-xlsr-53-fake-audio-detection")

print(f"Downloading model: {MODEL_ID}")
print("This may take 60-90 seconds on first run (~450MB)...")

try:
    from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
    processor = AutoFeatureExtractor.from_pretrained(MODEL_ID)
    model = AutoModelForAudioClassification.from_pretrained(MODEL_ID)
    print(f"Model downloaded successfully: {MODEL_ID}")
    print(f"Labels: {model.config.id2label}")
except Exception as e:
    print(f"ERROR: Failed to download model: {e}", file=sys.stderr)
    sys.exit(1)
